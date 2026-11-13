import { useState } from 'react';
import { Popover as P } from 'radix-ui';
import type { RiskLevel } from '../../api/contract';
import { cn } from '../../components/cn';
import { Building2, Factory, Pause, Truck, ZoomIn, ICON_STROKE } from '../../components/icons';
import { riskLabel } from '../../i18n/en';

/** UI plan §8.2 — markers use the status text colours as fills, white 2 px ring, icon inside. */
const levelFill: Record<RiskLevel | 'NONE', string> = {
  ON_TRACK: 'bg-success',
  WATCH: 'bg-warning',
  AT_RISK: 'bg-danger',
  LATE: 'bg-late',
  NONE: 'bg-info',
};

export function TruckMarker({
  code,
  level,
  stopped,
  selected,
  dimmed,
  showLabel = true,
  ariaLabel,
  onSelect,
  onHover,
}: {
  code: string;
  level: RiskLevel | null;
  stopped: boolean;
  selected: boolean;
  dimmed: boolean;
  /** The code chip; hidden for quiet trucks on busy maps so labels never pile up (the button keeps its name). */
  showLabel?: boolean;
  ariaLabel: string;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  return (
    <div className={cn('flex flex-col items-center', dimmed && 'opacity-40')}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={selected}
        title={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        className={cn(
          'relative flex items-center justify-center rounded-full border-2 border-surface text-on-primary shadow-sm transition-transform duration-[var(--rp-motion-fast)]',
          levelFill[level ?? 'NONE'],
          selected ? 'size-9 ring-4 ring-map-route-selected/45' : 'size-7 hover:scale-110',
        )}
      >
        <Truck aria-hidden className={selected ? 'size-[18px]' : 'size-3.5'} strokeWidth={2} />
        {stopped ? (
          <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full border border-surface bg-text">
            <Pause aria-hidden className="size-2 text-on-primary" strokeWidth={3} />
          </span>
        ) : null}
      </button>
      {showLabel && !dimmed ? (
        <span
          aria-hidden
          className={cn(
            'mt-0.5 rounded-full px-1.5 text-[11px] leading-4 font-medium code-label shadow-xs',
            selected ? 'bg-map-route-selected text-on-primary' : 'bg-ink-900 text-on-primary',
          )}
        >
          {code}
        </span>
      ) : null}
    </div>
  );
}

export interface ClusterMember {
  id: string;
  code: string;
  level: RiskLevel | null;
  ariaLabel: string;
}

/**
 * Several trucks whose markers would overlap at this zoom (UI plan §8.2). Shown at the most urgent
 * member's real position with its status colour and the count; opens a list to pick one truck, or
 * zooms in when the trucks are apart. Positions are never moved. The list is a Radix Popover: it
 * renders outside the map (never clipped by the frame or covered by other markers), flips away from
 * edges, moves focus into the list and returns it on Escape or outside click.
 */
export function TruckCluster({
  members,
  level,
  dimmed,
  onSelect,
  onZoom,
}: {
  members: ClusterMember[];
  level: RiskLevel | null;
  dimmed: boolean;
  onSelect: (id: string) => void;
  onZoom: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = `${members.length} trucks close together: ${members.map((m) => `${m.code}${m.level ? ` ${riskLabel[m.level].toLowerCase()}` : ''}`).join(', ')}`;
  return (
    <div className={cn('flex flex-col items-center', dimmed && !open && 'opacity-40')}>
      <P.Root open={open} onOpenChange={setOpen}>
        <P.Trigger
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'relative flex size-8 items-center justify-center rounded-full border-2 border-surface text-on-primary shadow-sm transition-transform duration-[var(--rp-motion-fast)] hover:scale-110',
            levelFill[level ?? 'NONE'],
          )}
        >
          <Truck aria-hidden className="size-3.5" strokeWidth={2} />
          <span aria-hidden className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-surface bg-ink-900 px-1 text-[10px] leading-none font-semibold tabular">
            {members.length}
          </span>
        </P.Trigger>
        <P.Portal>
          <P.Content
            side="top"
            sideOffset={8}
            collisionPadding={12}
            aria-label="Trucks at this spot"
            className="z-50 w-56 rounded-xl border border-border bg-surface p-1 shadow-md data-[state=open]:animate-[rp-fade_var(--rp-motion-fast)_ease-out]"
          >
            <ul aria-label="Trucks at this spot">
              {members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-label={m.ariaLabel}
                    onClick={() => {
                      setOpen(false);
                      onSelect(m.id);
                    }}
                    className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-small text-text hover:bg-surface-sunken"
                  >
                    <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', levelFill[m.level ?? 'NONE'])} />
                    <span className="font-medium code-label">{m.code}</span>
                    <span className="ml-auto text-text-muted">{m.level ? riskLabel[m.level] : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onZoom();
              }}
              className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-lg border-t border-border px-2 text-small text-text-secondary hover:bg-surface-sunken"
            >
              <ZoomIn aria-hidden className="size-3.5" strokeWidth={ICON_STROKE} />
              Zoom in on these trucks
            </button>
          </P.Content>
        </P.Portal>
      </P.Root>
      {dimmed && !open ? null : (
        <span aria-hidden className="mt-0.5 rounded-full bg-ink-900 px-1.5 text-[11px] leading-4 font-medium whitespace-nowrap text-on-primary shadow-xs">
          {members.length} trucks
        </span>
      )}
    </div>
  );
}

export function PlantMarker({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${name} (plant)`}>
      <span className="flex size-7 items-center justify-center rounded-sm border-2 border-surface bg-ink-900 text-on-primary shadow-sm">
        <Factory aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
      </span>
      <span aria-hidden className="mt-0.5 rounded-full bg-ink-900 px-1.5 text-[11px] leading-4 font-semibold text-on-primary">
        {name}
      </span>
    </div>
  );
}

export function SiteMarker({ name, city, receivingHours }: { name: string; city: string; receivingHours: string }) {
  const label = `${name}, ${city} · receiving ${receivingHours}`;
  return (
    <div className="group flex flex-col items-center" role="img" aria-label={label} title={label}>
      <span className="flex size-6 items-center justify-center rounded-full border-2 border-ink-900 bg-surface text-ink-900 shadow-xs">
        <Building2 aria-hidden className="size-3" strokeWidth={2} />
      </span>
      <span
        aria-hidden
        className="mt-0.5 hidden rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] leading-4 whitespace-nowrap text-text shadow-xs group-hover:block"
      >
        {name} · {receivingHours}
      </span>
    </div>
  );
}

export function DisruptionPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-danger/40 bg-danger-tint px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-danger shadow-xs">
      {label}
    </span>
  );
}

export function truckAriaLabel(code: string, level: RiskLevel | null, etaText: string | null): string {
  return [code, level ? riskLabel[level] : null, etaText ? `estimated arrival ${etaText}` : null].filter(Boolean).join(', ');
}
