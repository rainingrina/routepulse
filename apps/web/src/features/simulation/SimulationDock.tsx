import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSimClock, useSimReset } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { InlineError } from '../../components/display/feedback';
import { Button, IconButton } from '../../components/primitives/Button';
import { Dialog, SegmentedControl } from '../../components/primitives/radix';
import { CloudRain, FlaskConical, Pause, Play, RefreshCw, ICON_STROKE } from '../../components/icons';
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
  if (!sync) return null;
  const enabled = sync.demoMode && !clock.isPending && !reset.isPending;

  return (
    <div className="absolute right-3 bottom-3 z-10 w-[280px] rounded-lg border-2 border-accent/60 bg-surface/95 p-3 shadow-md">
      <div className="flex items-center gap-1.5">
        <FlaskConical aria-hidden className="size-4 text-accent" strokeWidth={ICON_STROKE} />
        <span className="overline text-accent">{t.sim.badge}</span>
        <span className="ml-auto text-small font-medium text-text tabular">{formatDayTime(sync.simTime)}</span>
      </div>
      {!sync.demoMode ? <p className="mt-2 text-small text-text-muted">{t.sim.demoOff}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <IconButton
          icon={sync.running ? Pause : Play}
          label={sync.running ? t.sim.pause : t.sim.play}
          disabled={!enabled}
          onClick={() => clock.mutate({ action: sync.running ? 'PAUSE' : 'PLAY' })}
          className="border border-border-strong"
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
