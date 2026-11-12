import { MILESTONES, type Milestone, type Role, type SimStateDto } from '@routepulse/shared';
import type { PrismaClient } from '../db/prisma.js';
import { DomainError } from '../errors/domainError.js';
import { eligibleCheckIn } from '../engines/receivingWindow.js';
import { simulate, recordArrival, type SimEvent, type SimShipment } from '../engines/simulate.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HERO_SHIPMENT_ID } from '../seed/live.js';
import { DEMO_DATE } from '../seed/constants.js';
import { runSeed } from '../seed/seed.js';
import { istAt, istMinuteOfDay } from '../engines/time.js';
import { Mutex } from '../sim/mutex.js';
import {
  SIM_CONFIG,
  fromS,
  loadDisruptions,
  loadLiveShipments,
  loadStaticWorld,
  persistEvents,
  persistLedger,
  persistShipments,
  releaseTrucks,
  toS,
  type Db,
  type StaticWorld,
} from '../sim/world.js';
import { writeAudit } from './auditService.js';
import { recalculate, type RecalcContext, type RecalcTrigger } from './etaService.js';
import { finalizeArrival } from './attributionService.js';
import { onArrived } from './alertService.js';

/** Ledger rows become FINAL (plus GAP) for every shipment that reached ARRIVED in these events. */
async function finalizeArrivals(tx: Prisma.TransactionClient, events: readonly SimEvent[]): Promise<void> {
  const ids = [...new Set(events.filter((e) => e.type === 'MILESTONE' && e.milestone === 'ARRIVED').map((e) => e.shipmentId))].sort();
  for (const id of ids) {
    await finalizeArrival(tx, id);
    await onArrived(tx, id);
  }
}

/**
 * Simulation service (architecture §6.3, §9). Owns the clock and the mutation pipeline:
 *
 *   world lock → transaction { settle (engine) → apply action → recalculate hook → persist →
 *   worldVersion if material } → commit
 *
 * The recalculate step is etaService.recalculate (Milestone 5): ETA, risk, cached fields and
 * snapshots for every live shipment, inside the same transaction. Every state change — grid steps
 * (movement, ledger, GPS pings), milestones, reset and any action submitted through applyChange
 * (disruptions, reports, recovery, receiving-window changes) — goes through this one pipeline.
 * State only settles on 5-minute grid boundaries and at action minutes; advancing to a time between
 * boundaries just moves the continuous clock (positions are extrapolated on read later). This keeps
 * results identical however the time is divided into calls.
 */

export type { RecalcTrigger } from './etaService.js';
/** Returns true when it made a material change (worldVersion is bumped). */
export type RecalcHook = (tx: Prisma.TransactionClient, ctx: RecalcContext) => Promise<boolean | void>;

export interface Actor {
  userId: string | null;
  role: Role | null;
}

export type ClockCommand =
  | { action: 'PLAY' }
  | { action: 'PAUSE' }
  | { action: 'SET_SPEED'; speed: 1 | 10 | 60 }
  | { action: 'ADVANCE'; minutes: number }
  | { action: 'ADVANCE_TO'; to: Date };

export interface SimulationServiceDeps {
  prisma: PrismaClient;
  demoMode: boolean;
  /** Monotonic real-time clock in ms (injectable for tests). */
  realNow?: () => number;
  /** Start a real setInterval ticker on PLAY (false in tests; they call tick()). */
  timers?: boolean;
  recalc?: RecalcHook;
  seedDemoPassword?: string;
}

const STEP_S = SIM_CONFIG.stepSec;
const MAX_STEPS_PER_TICK = 12;
const TICK_MS = 250;
const nextBoundary = (s: number) => (Math.floor(s / STEP_S) + 1) * STEP_S;
const istHm = (s: number) => {
  const m = Math.round(istMinuteOfDay(fromS(s)));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

interface Clock {
  simMs: number;
  running: boolean;
  speed: 1 | 10 | 60;
  lastRealMs: number;
  worldVersion: number;
  lastSettledS: number;
  simError: string | null;
}

export function createSimulationService(deps: SimulationServiceDeps) {
  const { prisma, demoMode } = deps;
  const realNow = deps.realNow ?? (() => performance.now());
  const recalc: RecalcHook = deps.recalc ?? recalculate;
  const lock = new Mutex();
  let clock: Clock | null = null;
  let world: StaticWorld | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  // ───────────── state ─────────────

  async function loadClock(): Promise<Clock> {
    if (clock) return clock;
    const row = await prisma.simState.findUnique({ where: { id: 1 } });
    if (!row) throw new DomainError('CONFLICT', 'The simulation has not been seeded yet. Run the seed or reset the demo.');
    // A restarted server always starts paused.
    clock = {
      simMs: row.simTime.getTime(),
      running: false,
      speed: row.speed === 10 || row.speed === 60 ? row.speed : 1,
      lastRealMs: realNow(),
      worldVersion: row.worldVersion,
      lastSettledS: toS(row.lastSettledAt),
      simError: row.simError,
    };
    return clock;
  }

  async function staticWorld(db: Db): Promise<StaticWorld> {
    if (!world) world = await loadStaticWorld(db);
    return world;
  }

  async function persistClock(tx: Db, c: Clock, bumpVersion: boolean): Promise<void> {
    if (bumpVersion) c.worldVersion += 1;
    await tx.simState.update({
      where: { id: 1 },
      data: {
        simTime: new Date(c.simMs),
        lastSettledAt: fromS(c.lastSettledS),
        running: c.running,
        speed: c.speed,
        worldVersion: c.worldVersion,
        simError: c.simError,
      },
    });
  }

  function toDto(c: Clock): SimStateDto {
    return {
      simTime: new Date(c.simMs).toISOString(),
      running: c.running,
      speed: c.speed,
      stepMinutes: STEP_S / 60,
      worldVersion: c.worldVersion,
      simError: c.simError,
      demoMode,
    };
  }

  // ───────────── settle: run the engine from lastSettled to targetS in one transaction ─────────────

  async function settleOnce(targetS: number, trigger: RecalcTrigger): Promise<SimEvent[]> {
    const c = await loadClock();
    if (targetS <= c.lastSettledS) return [];
    const fromSec = c.lastSettledS;
    const snapshot = { ...c };
    try {
      return await prisma.$transaction(
        async (tx) => {
          const w = await staticWorld(tx);
          const disruptions = await loadDisruptions(tx, fromSec);
          const before = await loadLiveShipments(tx, w, disruptions);
          const result = simulate({ shipments: before, routes: w.routes, disruptions, config: SIM_CONFIG, fromS: fromSec, toS: targetS });
          await persistShipments(tx, before, result.shipments);
          await persistLedger(tx, before, result.shipments, disruptions, targetS);
          await persistEvents(tx, result.events, 'SIMULATION');
          await finalizeArrivals(tx, result.events);
          await releaseTrucks(tx, result.delivered);
          c.lastSettledS = targetS;
          if (c.simMs < targetS * 1000) c.simMs = targetS * 1000;
          const eventShipmentIds = [...new Set(result.events.map((e) => e.shipmentId))];
          const material = await recalc(tx, { simTimeS: targetS, trigger, world: w, eventShipmentIds });
          await persistClock(tx, c, result.events.length > 0 || material === true);
          return result.events;
        },
        { timeout: 30_000 },
      );
    } catch (err) {
      Object.assign(c, snapshot); // the transaction rolled back: restore the in-memory clock too
      throw err;
    }
  }

  /** Processes every grid boundary ≤ targetMs, one transaction per step. Returns steps executed. */
  async function advanceToInternal(targetMs: number, maxSteps = Infinity): Promise<number> {
    const c = await loadClock();
    let steps = 0;
    for (let b = nextBoundary(c.lastSettledS); b * 1000 <= targetMs; b = nextBoundary(c.lastSettledS)) {
      if (steps >= maxSteps) return steps;
      await settleOnce(b, 'STEP');
      steps += 1;
    }
    if (c.simMs < targetMs) c.simMs = targetMs;
    return steps;
  }

  /** Brings the continuous clock up to real time (running only). Long-gap guard (R8). */
  async function catchUp(): Promise<number> {
    const c = await loadClock();
    if (!c.running) return 0;
    const now = realNow();
    const target = c.simMs + Math.floor((now - c.lastRealMs) * c.speed);
    c.lastRealMs = now;
    const pending = Math.floor(target / 1000 / STEP_S) - Math.floor(c.lastSettledS / STEP_S);
    if (pending > MAX_STEPS_PER_TICK) {
      const steps = await advanceToInternal(target, MAX_STEPS_PER_TICK);
      c.running = false;
      c.simMs = c.lastSettledS * 1000;
      c.simError = 'Clock paused after a long gap';
      stopTimer();
      await persistClock(prisma, c, true);
      return steps;
    }
    return advanceToInternal(target);
  }

  // ───────────── driver milestones (manual / hero shipments, D7, L6) ─────────────

  /** Stamps an action to the whole simulation minute and settles up to it (architecture §9.4). */
  async function settleForAction(): Promise<number> {
    const c = await loadClock();
    await catchUp();
    const actionS = Math.max(c.lastSettledS, Math.floor(c.simMs / 60_000) * 60);
    await advanceToInternal(actionS * 1000);
    if (actionS > c.lastSettledS) await settleOnce(actionS, 'STEP');
    return actionS;
  }

  /**
   * Generic action through the single pipeline: lock (caller) → settle to the action minute →
   * apply the change → recalculate all live shipments → bump worldVersion, in one transaction.
   * Used for disruptions, driver reports, reviews, recovery and receiving-window changes.
   */
  async function applyChangeInternal<T>(
    trigger: Exclude<RecalcTrigger, 'STEP' | 'MILESTONE' | 'RESET' | 'SEED'>,
    apply: (tx: Prisma.TransactionClient, actionS: number, world: StaticWorld) => Promise<{ result: T; shipmentIds?: readonly string[] }>,
  ): Promise<{ result: T; actionS: number }> {
    const c = await loadClock();
    const actionS = await settleForAction();
    const snapshot = { ...c };
    try {
      return await prisma.$transaction(
        async (tx) => {
          const w = await staticWorld(tx);
          const { result, shipmentIds = [] } = await apply(tx, actionS, w);
          c.lastSettledS = actionS;
          await recalc(tx, { simTimeS: actionS, trigger, world: w, actionShipmentIds: shipmentIds });
          await persistClock(tx, c, true);
          return { result, actionS };
        },
        { timeout: 30_000 },
      );
    } catch (err) {
      Object.assign(c, snapshot);
      throw err;
    }
  }

  async function recordMilestoneInternal(shipmentId: string, m: Milestone, actor: Actor, note?: string): Promise<void> {
    const c = await loadClock();
    const actionS = await settleForAction();

    const snapshot = { ...c };
    try {
      await prisma.$transaction(async (tx) => {
        const w = await staticWorld(tx);
        const disruptions = await loadDisruptions(tx, actionS);
        const before = await loadLiveShipments(tx, w, disruptions);
        const target = before.find((s) => s.id === shipmentId);
        if (!target) {
          // Delivered shipments leave the live set: a repeated tap is ALREADY_DONE, not missing.
          const done = await tx.shipment.findFirst({ where: { id: shipmentId, isHistorical: false, currentMilestone: 'DELIVERED' }, select: { id: true } });
          if (done) throw new DomainError('ALREADY_DONE', 'This milestone is already recorded.');
          throw new DomainError('NOT_FOUND', 'This item is not available.');
        }
        const working = before.map((s) => ({ ...s }));
        const sh = working.find((s) => s.id === shipmentId) as SimShipment;
        const driverEvents: SimEvent[] = [];
        const systemEvents: SimEvent[] = [];
        let delivered: string[] = [];

        if (sh.autopilot) throw new DomainError('INVALID_TRANSITION', "This shipment's milestones are recorded by the simulation.");
        // A milestone at or before the current one was already recorded (duplicate tap) — API §7.6.
        if (MILESTONES.indexOf(m) <= MILESTONES.indexOf(sh.milestone)) throw new DomainError('ALREADY_DONE', 'This milestone is already recorded.');
        switch (m) {
          case 'AT_GATE':
            if (sh.milestone !== 'TRUCK_ASSIGNED') throw new DomainError('INVALID_TRANSITION', 'The truck can only report at the gate once, after it is assigned.');
            sh.milestone = 'AT_GATE';
            sh.gateQueuedS = actionS;
            break;
          case 'GATE_OUT':
            if (sh.milestone !== 'LOADING' || sh.loadingEndS === null) throw new DomainError('INVALID_TRANSITION', 'Gate out is only possible after loading.');
            if (sh.loadingEndS > actionS) throw new DomainError('INVALID_TRANSITION', `Loading finishes at ${istHm(sh.loadingEndS)}.`);
            if (sh.plannedDepS > actionS) throw new DomainError('INVALID_TRANSITION', `Planned departure is ${istHm(sh.plannedDepS)}.`);
            sh.milestone = 'IN_TRANSIT';
            sh.gateOutS = actionS;
            systemEvents.push({ shipmentId: sh.id, atS: actionS, type: 'MILESTONE', milestone: 'IN_TRANSIT' });
            break;
          case 'ARRIVED': {
            if (sh.milestone !== 'IN_TRANSIT') throw new DomainError('INVALID_TRANSITION', 'Arrival can only be confirmed for a truck on the road.');
            if (sh.physicalArrivalS === null) {
              const route = w.routes.get(sh.routeId);
              const kmLeft = route ? Math.max(0, Math.ceil((route.lengthMm - sh.progressMm) / 1_000_000)) : 0;
              throw new DomainError('INVALID_TRANSITION', `Truck is ${kmLeft} km from the destination.`);
            }
            const eligible = toS(eligibleCheckIn(fromS(sh.physicalArrivalS), sh.hours, sh.overrideEndS === null ? null : fromS(sh.overrideEndS)));
            if (eligible > actionS) throw new DomainError('INVALID_TRANSITION', `Receiving opens at ${istHm(eligible)}.`);
            recordArrival(sh, eligible); // arrivedAt = eligible check-in, never the tap time (L6)
            sh.milestone = 'ARRIVED';
            break;
          }
          case 'DELIVERED': {
            if (sh.milestone !== 'ARRIVED' || sh.arrivedS === null) throw new DomainError('INVALID_TRANSITION', 'Delivery can only be confirmed after arrival.');
            const done = sh.arrivedS + (sh.unloadingMin + sh.extraUnloadMin) * 60;
            if (done > actionS) throw new DomainError('INVALID_TRANSITION', `Unloading finishes at ${istHm(done)}.`);
            sh.milestone = 'DELIVERED';
            sh.deliveredS = done; // completion time, not the tap time (L6)
            delivered = [sh.id];
            break;
          }
          default:
            throw new DomainError('INVALID_TRANSITION', `${m} cannot be recorded by a driver.`);
        }
        sh.lastUpdateS = actionS;
        driverEvents.unshift({
          shipmentId: sh.id,
          atS: m === 'ARRIVED' ? (sh.arrivedS as number) : m === 'DELIVERED' ? (sh.deliveredS as number) : actionS,
          type: 'MILESTONE',
          milestone: m,
        });

        // Apply any consequences at the same instant (e.g. the gate queue assigns a free bay).
        const settled = simulate({ shipments: working, routes: w.routes, disruptions, config: SIM_CONFIG, fromS: actionS, toS: actionS });
        await persistShipments(tx, before, settled.shipments);
        await persistLedger(tx, before, settled.shipments, disruptions, actionS);
        await persistEvents(tx, driverEvents, actor.role === 'COORDINATOR' ? 'COORDINATOR' : 'DRIVER', actor.userId, { tappedAt: fromS(actionS).toISOString(), ...(note ? { note } : {}) });
        await persistEvents(tx, systemEvents, 'SYSTEM');
        await persistEvents(tx, settled.events, 'SIMULATION');
        await finalizeArrivals(tx, [...driverEvents, ...settled.events]);
        await releaseTrucks(tx, [...delivered, ...settled.delivered]);
        await writeAudit(tx, { actorUserId: actor.userId, actorRole: actor.role, action: actor.role === 'COORDINATOR' ? 'milestone.override' : 'milestone.record', entityType: 'Shipment', entityId: shipmentId, data: { milestone: m, shipmentId, shipmentCode: sh.code, ...(note ? { note } : {}) } });
        c.lastSettledS = actionS;
        await recalc(tx, { simTimeS: actionS, trigger: 'MILESTONE', world: w, actionShipmentIds: [shipmentId], eventShipmentIds: [...new Set(settled.events.map((e) => e.shipmentId))] });
        await persistClock(tx, c, true);
      });
    } catch (err) {
      Object.assign(c, snapshot);
      throw err;
    }
  }

  // ───────────── reset (L2): seed, then the hero pre-script through the same services ─────────────

  async function resetInternal(actor: Actor): Promise<void> {
    if (!deps.seedDemoPassword) {
      throw new DomainError('CONFLICT', 'Reset is not configured: SEED_DEMO_PASSWORD is missing on the server.');
    }
    stopTimer();
    await runSeed(prisma, { demoPassword: deps.seedDemoPassword }); // keeps worldVersion monotonic
    clock = null;
    world = null;
    const c = await loadClock();
    // First calculation for the seeded world at the seed start (snapshot trigger SEED).
    await prisma.$transaction(
      async (tx) => {
        await recalc(tx, { simTimeS: c.lastSettledS, trigger: 'SEED', world: await staticWorld(tx) });
        await persistClock(tx, c, true);
      },
      { timeout: 30_000 },
    );

    const ramesh: Actor = { userId: 'usr_drv_ramesh', role: 'DRIVER' };
    await advanceToInternal(istAt(DEMO_DATE, 8 * 60 + 10).getTime());
    await recordMilestoneInternal(HERO_SHIPMENT_ID, 'AT_GATE', ramesh);
    await advanceToInternal(istAt(DEMO_DATE, 9 * 60 + 30).getTime());
    await recordMilestoneInternal(HERO_SHIPMENT_ID, 'GATE_OUT', ramesh);
    await advanceToInternal(istAt(DEMO_DATE, 10 * 60 + 25).getTime());

    c.running = false;
    c.speed = 1;
    c.simError = null;
    await prisma.$transaction(async (tx) => {
      await recalc(tx, { simTimeS: c.lastSettledS, trigger: 'RESET', world: await staticWorld(tx) });
      await persistClock(tx, c, true);
      await writeAudit(tx, { actorUserId: actor.userId, actorRole: actor.role, action: 'sim.reset', entityType: 'SimState', entityId: '1' });
    });
  }

  // ───────────── ticker ─────────────

  function startTimer(): void {
    if (deps.timers === false || timer) return;
    timer = setInterval(() => {
      void lock.run(catchUp).catch(async (err: unknown) => {
        const c = clock;
        if (!c) return;
        c.running = false;
        c.simError = `Simulation paused: ${err instanceof Error ? err.message : String(err)}`;
        stopTimer();
        await persistClock(prisma, c, true).catch(() => undefined);
      });
    }, TICK_MS);
  }

  function stopTimer(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // ───────────── public API (every mutation goes through the lock) ─────────────

  return {
    async state(): Promise<SimStateDto> {
      return lock.run(async () => {
        await catchUp();
        return toDto(await loadClock());
      });
    },

    async control(cmd: ClockCommand, actor: Actor): Promise<SimStateDto & { stepsExecuted: number }> {
      return lock.run(async () => {
        const c = await loadClock();
        let steps = await catchUp();
        switch (cmd.action) {
          case 'PLAY':
            c.running = true;
            c.simError = null;
            c.lastRealMs = realNow();
            startTimer();
            break;
          case 'PAUSE':
            c.running = false;
            stopTimer();
            break;
          case 'SET_SPEED':
            c.speed = cmd.speed;
            c.lastRealMs = realNow();
            break;
          case 'ADVANCE':
          case 'ADVANCE_TO': {
            c.running = false;
            stopTimer();
            const targetMs = cmd.action === 'ADVANCE' ? c.simMs + cmd.minutes * 60_000 : cmd.to.getTime();
            if (targetMs <= c.simMs) throw new DomainError('INVALID_TRANSITION', 'The target time must be later than the current simulation time.');
            if (targetMs > c.simMs + 24 * 3600_000) throw new DomainError('INVALID_TRANSITION', 'You can advance at most 24 hours at a time.');
            steps += await advanceToInternal(targetMs);
            break;
          }
        }
        await prisma.$transaction(async (tx) => {
          await persistClock(tx, c, true);
          await writeAudit(tx, {
            actorUserId: actor.userId,
            actorRole: actor.role,
            action: 'sim.clock',
            entityType: 'SimState',
            entityId: '1',
            data: cmd.action === 'ADVANCE_TO' ? { action: cmd.action, to: cmd.to.toISOString() } : { ...cmd },
          });
        });
        return { ...toDto(c), stepsExecuted: steps };
      });
    },

    async reset(actor: Actor): Promise<SimStateDto & { durationMs: number }> {
      return lock.run(async () => {
        const started = Date.now();
        await resetInternal(actor);
        return { ...toDto(await loadClock()), durationMs: Date.now() - started };
      });
    },

    /** #17: a driver tap or a coordinator override (note required by the controller; audit milestone.override). */
    async recordMilestone(shipmentId: string, milestone: Milestone, actor: Actor, note?: string): Promise<void> {
      return lock.run(() => recordMilestoneInternal(shipmentId, milestone, actor, note));
    },

    /** Any world change (disruption, report, review, recovery, window) through the single pipeline. */
    async applyChange<T>(
      trigger: Parameters<typeof applyChangeInternal<T>>[0],
      apply: Parameters<typeof applyChangeInternal<T>>[1],
    ): Promise<{ result: T; actionS: number }> {
      return lock.run(() => applyChangeInternal(trigger, apply));
    },

    /**
     * Read-only access with the current continuous simulation time (positions extrapolate between
     * grid steps from the last settled state). Writes nothing.
     */
    async readNow<T>(fn: (db: PrismaClient, world: StaticWorld, settledS: number, nowS: number) => Promise<T>): Promise<T> {
      return lock.run(async () => {
        const c = await loadClock();
        return fn(prisma, await staticWorld(prisma), c.lastSettledS, Math.floor(c.simMs / 1000));
      });
    },

    /**
     * An action that changes no ETA input (customer response, notification read state): lock →
     * settle to the action minute → apply → worldVersion, in one transaction. No recalculation.
     */
    async commitAction<T>(apply: (tx: Prisma.TransactionClient, actionS: number) => Promise<T>): Promise<T> {
      return lock.run(async () => {
        const c = await loadClock();
        const actionS = await settleForAction();
        const snapshot = { ...c };
        try {
          return await prisma.$transaction(async (tx) => {
            const out = await apply(tx, actionS);
            c.lastSettledS = actionS;
            await persistClock(tx, c, true);
            return out;
          });
        } catch (err) {
          Object.assign(c, snapshot);
          throw err;
        }
      });
    },

    /**
     * Read-only access at the last settled time (ETA reads). Runs under the world lock so a read
     * never sees a half-applied step; it does not advance the clock and writes nothing.
     */
    async readSettled<T>(fn: (db: PrismaClient, world: StaticWorld, settledS: number) => Promise<T>): Promise<T> {
      return lock.run(async () => {
        const c = await loadClock();
        return fn(prisma, await staticWorld(prisma), c.lastSettledS);
      });
    },

    /** Real-time tick (called by the timer; tests call it directly with an injected clock). */
    async tick(): Promise<number> {
      return lock.run(catchUp);
    },

    stop(): void {
      stopTimer();
    },

    /** Drops cached clock/world (after external changes such as a direct seed). */
    invalidate(): void {
      clock = null;
      world = null;
    },
  };
}

export type SimulationService = ReturnType<typeof createSimulationService>;
