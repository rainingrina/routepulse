import { useState } from 'react';
import { RISK_LEVELS } from '../api/contract';
import { statusStyles } from '../components/display/StatusBadge';
import { cn } from '../components/cn';
import { ChevronDown, Layers, ICON_STROKE } from '../components/icons';

/** Collapsible legend, bottom-left (UI plan §6.4). Basemap note is explicit: offline land only for now. */
/** `illustrativeRoutes`: at least one route line is hand-traced demo geometry (`x_source: HAND_TRACED_DEMO`). */
export function MapLegend({
  showDisruptions,
  illustrativeRoutes = false,
  initiallyOpen = true,
}: {
  showDisruptions: boolean;
  illustrativeRoutes?: boolean;
  /** Small maps (portals, replay) start collapsed so the legend does not cover the route. */
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="absolute bottom-3 left-3 z-10 max-w-[240px] rounded-lg border border-border bg-surface/95 text-small shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 font-medium text-text"
      >
        <Layers aria-hidden className="size-3.5" strokeWidth={ICON_STROKE} />
        Legend
        <ChevronDown aria-hidden className={cn('ml-auto size-3.5 transition-transform', !open && '-rotate-90')} strokeWidth={ICON_STROKE} />
      </button>
      {open ? (
        <ul className="flex flex-col gap-1.5 border-t border-border px-3 py-2 text-text-secondary">
          {RISK_LEVELS.map((l) => {
            const s = statusStyles[l];
            const Icon = s.icon;
            return (
              <li key={l} className="flex items-center gap-2">
                <span className={cn('flex size-4 items-center justify-center rounded-full text-on-primary', s.bar)}>
                  <Icon aria-hidden className="size-2.5" strokeWidth={2.5} />
                </span>
                {s.label}
              </li>
            );
          })}
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-[3px] w-4 rounded bg-[var(--rp-map-route)]" />
            Primary route
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-[var(--rp-map-route-alt)]" />
            Alternate route (selected lane)
          </li>
          {showDisruptions ? (
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-danger" />
              Active disruption
            </li>
          ) : null}
          {illustrativeRoutes ? <li className="pt-1 text-[11px] leading-4 text-text-muted">Route lines are hand-traced illustrations, not routing output</li> : null}
          <li className="pt-1 text-[11px] leading-4 text-text-muted">Offline map · basemap detail pending</li>
        </ul>
      ) : null}
    </div>
  );
}
