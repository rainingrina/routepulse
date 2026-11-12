import { useSimClock } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { Badge } from '../../components/display/basics';
import { InlineError } from '../../components/display/feedback';
import { IconButton } from '../../components/primitives/Button';
import { SegmentedControl, Tooltip } from '../../components/primitives/radix';
import { FlaskConical, Pause, Play, ICON_STROKE } from '../../components/icons';
import { formatDayTime } from '../../i18n/format';
import { t } from '../../i18n/en';

type Speed = 1 | 10 | 60;
const SPEEDS: Speed[] = [1, 10, 60];

/**
 * Top-bar simulation clock (UI plan §3, §6.4): teal "SIMULATION · Thu 11:10" badge, PAUSED state,
 * play/pause and speed. Calls POST /api/sim/clock (#5); state comes back through /api/sync (#4).
 */
export function SimClockControl({ canControl }: { canControl: boolean }) {
  const { sync } = useSync();
  const clock = useSimClock();

  if (!sync) {
    return (
      <span className="inline-flex h-8 items-center rounded-full border border-accent/40 px-3 text-small text-text-muted">
        {t.sim.badge} · —
      </span>
    );
  }

  const controlsEnabled = canControl && sync.demoMode && !clock.isPending;
  const disabledReason = !sync.demoMode ? t.sim.demoOff : undefined;

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-accent/40 bg-accent-subtle px-3 text-small font-semibold text-accent"
        aria-live="off"
      >
        <FlaskConical aria-hidden className="size-3.5" strokeWidth={ICON_STROKE} />
        <span className="overline">{t.sim.badge}</span>
        <span className="tabular">{formatDayTime(sync.simTime)}</span>
      </span>
      {!sync.running ? <Badge tone="warning">{t.sim.paused}</Badge> : null}
      {canControl ? (
        <>
          <Tooltip content={disabledReason ?? (sync.running ? t.sim.pause : t.sim.play)}>
            <span>
              <IconButton
                icon={sync.running ? Pause : Play}
                label={sync.running ? t.sim.pause : t.sim.play}
                disabled={!controlsEnabled}
                onClick={() => clock.mutate({ action: sync.running ? 'PAUSE' : 'PLAY' })}
              />
            </span>
          </Tooltip>
          <SegmentedControl<string>
            label={t.sim.speed}
            size="sm"
            disabled={!controlsEnabled}
            value={String(sync.speed)}
            onChange={(v) => clock.mutate({ action: 'SET_SPEED', speed: Number(v) as Speed })}
            options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×`, ariaLabel: `${s} times speed` }))}
          />
          <InlineError error={clock.error} className="max-w-56" />
        </>
      ) : null}
    </div>
  );
}
