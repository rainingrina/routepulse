import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSimClock, useSimReset } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { InlineError } from '../../components/display/feedback';
import { Button, IconButton } from '../../components/primitives/Button';
import { Dialog, SegmentedControl } from '../../components/primitives/radix';
import { ChevronDown, ChevronUp, CloudRain, FlaskConical, Pause, Play, RefreshCw, ICON_STROKE } from '../../components/icons';
import { BP, useMediaQuery } from '../../app/useMediaQuery';
import { formatDayTime } from '../../i18n/format';
import { t } from '../../i18n/en';

type Speed = 1 | 10 | 60;

/**
 * Floating "SIMULATION" dock on the control-tower map (UI plan §6.4). Every control calls the API:
 * #5 clock (play/pause/speed/+1 h) and #6 reset. "Inject event" opens the Simulation page form.
 * Coordinator + DEMO_MODE only; the server enforces both.
 */
export function SimulationDock() {
  const { sync } = useSync();
  const clock = useSimClock();
  const reset = useSimReset();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const isXl = useMediaQuery(BP.xl);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  if (!sync) return null;
  const enabled = sync.demoMode && !clock.isPending && !reset.isPending;
  const open = expanded ?? isXl;

  if (!open) {
    // Collapsed below xl so the dock never covers markers, the legend or the attribution.
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-label={`Simulation ${formatDayTime(sync.simTime)}${sync.running ? ', running' : ', paused'}. Show simulation controls`}
        onClick={() => setExpanded(true)}
        className="on-dark absolute right-3 bottom-3 z-10 inline-flex h-10 items-center gap-2 rounded-full bg-nav-bg pr-3 pl-3 text-small font-medium text-nav-text-strong shadow-md"
      >
        <FlaskConical aria-hidden className="size-4 text-sage-muted" strokeWidth={ICON_STROKE} />
        <span className="tabular">{formatDayTime(sync.simTime)}</span>
        <span className="text-nav-text">{sync.running ? `${sync.speed}×` : t.sim.paused}</span>
        <ChevronUp aria-hidden className="size-4 text-nav-text" strokeWidth={ICON_STROKE} />
      </button>
    );
  }

  return (
    <div className="absolute right-3 bottom-3 z-10 w-[296px] max-w-[calc(100%-24px)] rounded-xl border border-border bg-surface/97 p-3 shadow-md backdrop-blur-sm data-[open]:animate-[rp-rise_var(--rp-motion-base)_var(--rp-ease)]" data-open>
      <div className="flex items-center gap-1.5">
        <span className="flex size-6 items-center justify-center rounded-lg bg-ink-900">
          <FlaskConical aria-hidden className="size-3.5 text-sage-muted" strokeWidth={ICON_STROKE} />
        </span>
        <span className="eyebrow text-text-secondary">{t.sim.badge}</span>
        <span className="ml-auto text-small font-semibold text-text tabular">{formatDayTime(sync.simTime)}</span>
        <IconButton icon={ChevronDown} label="Collapse simulation controls" size="sm" onClick={() => setExpanded(false)} />
      </div>
      {!sync.demoMode ? <p className="mt-2 text-small text-text-muted">{t.sim.demoOff}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <IconButton
          icon={sync.running ? Pause : Play}
          label={sync.running ? t.sim.pause : t.sim.play}
          disabled={!enabled}
          onClick={() => clock.mutate({ action: sync.running ? 'PAUSE' : 'PLAY' })}
          tone="outline"
        />
        <SegmentedControl<string>
          label={t.sim.speed}
          size="sm"
          disabled={!enabled}
          value={String(sync.speed)}
          onChange={(v) => clock.mutate({ action: 'SET_SPEED', speed: Number(v) as Speed })}
          options={[1, 10, 60].map((s) => ({ value: String(s), label: `${s}×`, ariaLabel: `${s} times speed` }))}
        />
        <Button size="sm" disabled={!enabled} onClick={() => clock.mutate({ action: 'ADVANCE', minutes: 60 })}>
          +1 h
        </Button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" icon={CloudRain} onClick={() => void navigate('/simulation')}>
          Inject event
        </Button>
        <Button size="sm" variant="ghost" icon={RefreshCw} disabled={!enabled} onClick={() => setConfirmReset(true)}>
          Reset demo
        </Button>
      </div>
      <InlineError error={clock.error ?? reset.error} className="mt-2" />
      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo?"
        description="Restores the seeded fictional demo state (simulation time Thu 10:25, paused). Everything done since is discarded."
        width="sm"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={reset.isPending}
              onClick={() => reset.mutate(undefined, { onSuccess: () => setConfirmReset(false) })}
            >
              Reset demo
            </Button>
          </>
        }
      >
        <InlineError error={reset.error} />
      </Dialog>
    </div>
  );
}
