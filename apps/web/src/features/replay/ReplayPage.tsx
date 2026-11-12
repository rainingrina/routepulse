import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { ReplayResponse, ReplaySnapshot, TimelineEvent } from '../../api/contract';
import { useReplay } from '../../api/hooks/portal';
import { useShipmentDetail } from '../../api/hooks/world';
import { useMediaQuery } from '../../app/useMediaQuery';
import { Card, CardHeader, ConfidenceChip, EmptyState, KeyValue, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { StatusBadge } from '../../components/display/StatusBadge';
import { ChevronLeft, ChevronRight, History, ICON_STROKE, Pause, Play } from '../../components/icons';
import { Button, IconButton } from '../../components/primitives/Button';
import { Breadcrumbs, SegmentedControl, Tooltip } from '../../components/primitives/radix';
import { riskLabel, t } from '../../i18n/en';
import { formatDayTime, formatDuration, formatFull, formatSlack, formatTime, formatTimeRelative } from '../../i18n/format';
import { MiniMap } from '../../map/MiniMap';
import { FactorList } from '../shipment/FactorList';
import { EtaTimelineChart } from './EtaTimelineChart';

const PLAY_INTERVAL_MS = 1_000;

/** Start on the first-at-risk snapshot when there is one, otherwise the latest snapshot. */
export function initialSnapshotIndex(r: ReplayResponse): number {
  if (r.snapshots.length === 0) return 0;
  const i = r.firstAtRiskAt ? r.snapshots.findIndex((s) => s.simTime === r.firstAtRiskAt) : -1;
  return i >= 0 ? i : r.snapshots.length - 1;
}

/** The last snapshot at or before `iso` (scrubber snaps to stored snapshots). */
export function snapshotIndexAt(r: ReplayResponse, iso: string): number {
  let idx = 0;
  r.snapshots.forEach((s, i) => {
    if (s.simTime <= iso) idx = i;
  });
  return idx;
}

export function sliderText(s: ReplaySnapshot): string {
  return `${formatTime(s.simTime)}, ${riskLabel[s.level]}, estimated arrival ${formatFull(s.predictedArrivalAt)}`;
}

/**
 * Historical replay (UI plan §10; #19, #10). Read-only: every value is a stored RiskSnapshot from the
 * one recalculation pipeline; the page never writes and never changes the simulation clock.
 */
export default function ReplayPage() {
  const { id = '' } = useParams();
  const replay = useReplay(id);
  const detail = useShipmentDetail(id);

  if (replay.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (replay.isError) return <ErrorState title="Couldn't load the replay" error={replay.error} onRetry={() => void replay.refetch()} />;
  const r = replay.data;
  const laneId = detail.data?.shipment.view === 'coordinator' ? detail.data.shipment.lane.id : null;
  const routeId = detail.data?.shipment.view === 'coordinator' ? detail.data.shipment.route.id : '';
  return <ReplayView r={r} laneId={laneId} routeId={routeId} />;
}

function ReplayView({ r, laneId, routeId }: { r: ReplayResponse; laneId: string | null; routeId: string }) {
  const [idx, setIdx] = useState(() => initialSnapshotIndex(r));
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const n = r.snapshots.length;
  const s = r.snapshots[Math.min(idx, n - 1)] ?? null;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setIdx((i) => {
        if (i >= n - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, n]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-x-hidden p-4 lg:p-6">
      <Breadcrumbs
        items={[
          { label: 'Control tower', to: '/control-tower' },
          { label: r.code, to: `/shipments/${encodeURIComponent(r.shipmentId)}` },
          { label: 'Replay' },
        ]}
      />
      <header className="on-dark flex flex-wrap items-center gap-3 rounded-xl bg-nav-bg px-4 py-3 text-nav-text-strong">
        <History aria-hidden className="size-5 text-sage-muted" strokeWidth={ICON_STROKE} />
        <h1 className="text-h2">
          <span className="code-label">{r.code}</span> <span className="font-normal text-nav-text">· Replay</span>
        </h1>
        <span className="rounded-full border border-nav-border px-2.5 py-0.5 text-small text-nav-text">Historical view, read-only</span>
        <span className="flex-1" />
        <FirstAtRiskCallout r={r} />
      </header>
      <p className="-mt-1 text-small text-text-muted">
        Stored rule-based snapshots for this shipment. Nothing here changes the simulation. Promised by {formatDayTime(r.promisedBy)} · planned arrival {formatDayTime(r.plannedArrivalAt)}.
      </p>

      {n === 0 || !s ? (
        <Card>
          <EmptyState icon={History} title="No snapshots yet" help="Snapshots are stored each time the estimate is recalculated." />
        </Card>
      ) : (
        <>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <MiniMap
              shipmentIds={[r.shipmentId]}
              ariaLabel={`Position of ${r.code} at ${formatTime(s.simTime)}`}
              className="h-80"
              trucks={[
                {
                  item: { shipmentId: r.shipmentId, code: r.code, routeId, lat: s.position.lat, lng: s.position.lng, bearing: 0, progressPct: 0, currentMilestone: 'IN_TRANSIT', riskLevel: s.level, stopped: false },
                  etaText: formatFull(s.predictedArrivalAt),
                },
              ]}
              {...(laneId ? { routeFilter: (route: { laneId: string }) => route.laneId === laneId } : {})}
            />
            <SnapshotPanel s={s} />
          </div>

          <Card aria-label="Estimate over time">
            <CardHeader
              title="Estimated arrival over time"
              eyebrow={t.ruleBased}
              actions={
                <SegmentedControl<'chart' | 'table'>
                  size="sm"
                  label="Chart or table"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'chart', label: 'Chart' },
                    { value: 'table', label: 'Table' },
                  ]}
                />
              }
            />
            <div className="p-4">
              {view === 'chart' ? (
                <>
                  <EtaTimelineChart replay={r} selectedTime={s.simTime} />
                  <ul className="mt-2 flex flex-wrap gap-4 text-small text-text-secondary" aria-label="Legend">
                    <li className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-0.5 w-5 bg-primary" /> Estimated arrival
                    </li>
                    <li className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-3 w-5 rounded-sm bg-primary-subtle" /> Range
                    </li>
                    <li className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="w-5 border-t-2 border-dashed border-ink-900" /> Promised by
                    </li>
                    {r.firstAtRiskAt ? (
                      <li className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2.5 rotate-45 bg-danger" /> First at risk
                      </li>
                    ) : null}
                  </ul>
                </>
              ) : (
                <SnapshotTable r={r} selected={idx} onSelect={setIdx} />
              )}
            </div>
          </Card>

          <Card aria-label="Replay controls">
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <IconButton icon={ChevronLeft} label="Previous snapshot" disabled={idx <= 0} onClick={() => setIdx((i) => Math.max(0, i - 1))} />
                <IconButton icon={ChevronRight} label="Next snapshot" disabled={idx >= n - 1} onClick={() => setIdx((i) => Math.min(n - 1, i + 1))} />
                <input
                  type="range"
                  min={0}
                  max={n - 1}
                  step={1}
                  value={idx}
                  onChange={(e) => setIdx(Number(e.target.value))}
                  aria-label="Replay position"
                  aria-valuetext={sliderText(s)}
                  className="min-w-40 flex-1 accent-primary"
                />
                <span className="w-14 text-body font-medium text-text tabular">{formatTime(s.simTime)}</span>
                <Button
                  size="md"
                  variant="primary"
                  icon={playing ? Pause : Play}
                  disabled={reducedMotion || n < 2}
                  onClick={() => {
                    if (!playing && idx >= n - 1) setIdx(0);
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? 'Pause' : 'Play replay'}
                </Button>
              </div>
              {reducedMotion ? <p className="text-small text-text-muted">Play is off because reduced motion is on; step with the arrows or the keyboard.</p> : null}
              <EventMarkers r={r} reference={r.snapshots[n - 1]?.simTime ?? r.promisedBy} onJump={(iso) => setIdx(snapshotIndexAt(r, iso))} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function FirstAtRiskCallout({ r }: { r: ReplayResponse }) {
  if (!r.firstAtRiskAt) {
    return <span className="rounded-full border border-nav-border px-3 py-1 text-body text-nav-text-strong">Never at risk</span>;
  }
  return (
    <span className="rounded-full bg-nav-active px-3 py-1 text-body font-medium text-nav-active-text">
      First at risk {formatTime(r.firstAtRiskAt)}
      {r.leadTimeMinutes !== null ? ` · ${formatDuration(r.leadTimeMinutes)} before promise` : ''}
    </span>
  );
}

function SnapshotPanel({ s }: { s: ReplaySnapshot }) {
  return (
    <Card aria-label="Snapshot at the selected time">
      <CardHeader title={`At ${formatDayTime(s.simTime)}`} eyebrow={`Snapshot · ${triggerLabel(s.trigger)}`} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={s.level} />
          <ConfidenceChip confidence={s.confidence} />
          <span className="text-small text-text-muted tabular">score {s.score}</span>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <KeyValue label="Estimated arrival">
            <EtaDisplay at={s.predictedArrivalAt} low={s.etaLowAt} high={s.etaHighAt} reference={s.simTime} className="font-semibold" />
          </KeyValue>
          <KeyValue label="Slack">{formatSlack(s.slackMinutes)}</KeyValue>
        </dl>
        {s.factors.length > 0 ? <FactorList factors={s.factors} compact /> : <p className="text-body text-text-muted">No delay factors at this moment.</p>}
      </div>
    </Card>
  );
}

const TRIGGER_TEXT: Record<string, string> = {
  STEP: 'clock step',
  MILESTONE: 'milestone',
  REPORT: 'driver report',
  REVIEW: 'report review',
  DISRUPTION: 'disruption',
  RECOVERY: 'recovery',
  SEED: 'start of day',
};
const triggerLabel = (trigger: string) => TRIGGER_TEXT[trigger] ?? trigger.toLowerCase();

function SnapshotTable({ r, selected, onSelect }: { r: ReplayResponse; selected: number; onSelect: (i: number) => void }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-left text-body">
        <caption className="sr-only">Stored snapshots</caption>
        <thead className="sticky top-0 bg-surface text-small text-text-muted">
          <tr>
            <th className="py-1 pr-3 font-medium">Time</th>
            <th className="py-1 pr-3 font-medium">Trigger</th>
            <th className="py-1 pr-3 font-medium">Level</th>
            <th className="py-1 pr-3 font-medium">Estimated arrival</th>
            <th className="py-1 font-medium">Slack</th>
          </tr>
        </thead>
        <tbody>
          {r.snapshots.map((s, i) => (
            <tr key={s.id} className={i === selected ? 'bg-primary-subtle' : 'border-t border-border'}>
              <td className="py-1 pr-3 tabular">
                <button type="button" className="link" onClick={() => onSelect(i)}>
                  {formatTime(s.simTime)}
                </button>
              </td>
              <td className="py-1 pr-3">{triggerLabel(s.trigger)}</td>
              <td className="py-1 pr-3">{riskLabel[s.level]}</td>
              <td className="py-1 pr-3 tabular">
                <EtaDisplay at={s.predictedArrivalAt} low={s.etaLowAt} high={s.etaHighAt} reference={s.simTime} />
              </td>
              <td className="py-1 tabular">{formatSlack(s.slackMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MARKER_TYPES = new Set<TimelineEvent['type']>(['MILESTONE', 'DRIVER_REPORT', 'DISRUPTION_STARTED', 'ALERT_OPENED', 'RECOVERY_CHOSEN', 'CUSTOMER_NOTIFIED', 'PHYSICAL_ARRIVAL']);

/** Keyboard-focusable event markers (summary + time); choosing one jumps to the snapshot in force then. */
function EventMarkers({ r, reference, onJump }: { r: ReplayResponse; reference: string; onJump: (iso: string) => void }) {
  const events = r.events.filter((e) => MARKER_TYPES.has(e.type));
  if (events.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-small text-text-muted">Events</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Shipment events">
        {events.map((e) => (
          <li key={e.id}>
            <Tooltip content={`${e.summary} · ${formatDayTime(e.simTime)}`}>
              <button
                type="button"
                onClick={() => onJump(e.simTime)}
                className="rounded-full border border-border-strong bg-surface px-2.5 py-1 text-small text-text hover:bg-surface-subtle"
              >
                <span className="tabular">{formatTimeRelative(e.simTime, reference)}</span> · {e.summary}
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}
