import { useRef, type KeyboardEvent } from 'react';
import type { ShipmentListItemCoordinator } from '../../api/contract';
import { Badge, ConfidenceChip, EmptyState, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { StatusBadge, statusForShipment, statusStyles } from '../../components/display/StatusBadge';
import { cn } from '../../components/cn';
import { FileText, Inbox, Search, TriangleAlert, ICON_STROKE } from '../../components/icons';
import { formatSlack, formatTime, formatTimeRelative } from '../../i18n/format';
import { riskLabel } from '../../i18n/en';
import { LEVEL_FILTERS, type LevelFilter } from './listFilters';

const filterLabel: Record<LevelFilter, string> = {
  ALL: 'All',
  AT_RISK: riskLabel.AT_RISK,
  WATCH: riskLabel.WATCH,
  ON_TRACK: riskLabel.ON_TRACK,
  LATE: riskLabel.LATE,
};

export function ShipmentList({
  items,
  totalCount,
  isPending,
  error,
  onRetry,
  level,
  onLevel,
  query,
  onQuery,
  selectedId,
  onSelect,
  hoveredId,
  onHover,
  simTime,
  highlightIds,
}: {
  items: ShipmentListItemCoordinator[];
  totalCount: number;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  level: LevelFilter;
  onLevel: (l: LevelFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  simTime: string | undefined;
  highlightIds: Set<string>;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // ↑/↓ move focus between rows, Enter selects (native button), Esc clears the selection (UI plan §6.3).
  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-row]') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[Math.min(i + 1, buttons.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[Math.max(i - 1, 0)]?.focus();
    } else if (e.key === 'Escape') {
      onSelect(null);
    }
  }

  return (
    <section aria-labelledby="shipments-heading" className="flex min-h-0 flex-col border-border bg-surface lg:border-r">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 id="shipments-heading" className="text-h3 text-text">
            Shipments
          </h2>
          <span className="text-small text-text-muted tabular">
            {items.length === totalCount ? `${totalCount} live` : `${items.length} of ${totalCount}`}
          </span>
        </div>
        <label className="relative block">
          <span className="sr-only">Search by shipment code</span>
          <Search aria-hidden className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted" strokeWidth={ICON_STROKE} />
          <input
            type="search"
            value={query}
            maxLength={32}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search code, e.g. SHP-1042"
            className="h-9 w-full rounded-sm border border-border-input bg-surface pr-3 pl-8 text-body placeholder:text-text-muted"
          />
        </label>
        <div role="group" aria-label="Filter by risk level" className="flex flex-wrap gap-1.5">
          {LEVEL_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={level === f}
              onClick={() => onLevel(f)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-small font-medium',
                level === f ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong text-text-secondary hover:bg-surface-subtle',
              )}
            >
              {f !== 'ALL'
                ? (() => {
                    const Icon = statusStyles[f].icon;
                    return <Icon aria-hidden className="size-3" strokeWidth={2} />;
                  })()
                : null}
              {filterLabel[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[72px]" />
            ))}
          </div>
        ) : error ? (
          <ErrorState compact title="Couldn't load shipments" error={error} onRetry={onRetry} />
        ) : totalCount === 0 ? (
          <EmptyState icon={Inbox} title="No live shipments" help="New shipments appear here once a truck is assigned." />
        ) : items.length === 0 ? (
          <EmptyState icon={Search} title="No shipments match these filters" action={<button type="button" className="text-body font-medium text-primary hover:underline" onClick={() => { onLevel('ALL'); onQuery(''); }}>Clear filters</button>} />
        ) : (
          <ul ref={listRef} onKeyDown={onKeyDown} aria-label="Live shipments, sorted by risk">
            {items.map((s) => (
              <ShipmentRow
                key={s.id}
                s={s}
                selected={s.id === selectedId}
                hovered={s.id === hoveredId}
                highlight={highlightIds.has(s.id)}
                simTime={simTime}
                onSelect={() => onSelect(s.id === selectedId ? null : s.id)}
                onHover={(h) => onHover(h ? s.id : null)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ShipmentRow({
  s,
  selected,
  hovered,
  highlight,
  simTime,
  onSelect,
  onHover,
}: {
  s: ShipmentListItemCoordinator;
  selected: boolean;
  hovered: boolean;
  highlight: boolean;
  simTime: string | undefined;
  onSelect: () => void;
  onHover: (h: boolean) => void;
}) {
  const status = statusForShipment(s);
  const bar = status ? statusStyles[status].bar : 'bg-border-strong';
  return (
    <li className={cn('border-b border-border', s.parentShipmentId && 'pl-4')}>
      <button
        type="button"
        data-row
        aria-pressed={selected}
        onClick={onSelect}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className={cn(
          'relative flex min-h-[72px] w-full gap-3 py-2.5 pr-3 pl-4 text-left transition-colors',
          selected ? 'bg-primary-subtle' : hovered ? 'bg-surface-subtle' : 'hover:bg-surface-subtle',
          highlight && 'animate-pulse',
        )}
      >
        <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', bar)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {status ? <StatusBadge status={status} size="sm" /> : null}
            <span className="text-body font-semibold text-text code-label">{s.code}</span>
            {s.parentShipmentId ? <Badge>Split</Badge> : null}
            <span className="ml-auto flex items-center gap-1">
              {s.hasOpenAlert ? (
                <Badge tone="danger" icon={TriangleAlert}>
                  Alert
                </Badge>
              ) : null}
              {s.pendingReportCount > 0 ? (
                <Badge tone="warning" icon={FileText}>
                  Report pending
                </Badge>
              ) : null}
            </span>
          </div>
          <p className="truncate text-small text-text-secondary">
            {s.customer.name}, {s.customer.city} · {s.transporter.name}
            {s.truckCode ? ` · ${s.truckCode}` : ''}
          </p>
          {s.arrivedAt ? (
            <p className="text-small text-text tabular">
              Arrived {formatTime(s.arrivedAt)} · {s.onTime ? 'on time' : 'after the promised time'}
              {s.deliveredAt ? ` · delivered ${formatTime(s.deliveredAt)}` : ' · unloading'}
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-x-2 text-small text-text tabular">
              <span>
                ETA <EtaDisplay at={s.etaAt} low={s.etaLowAt} high={s.etaHighAt} reference={simTime} className="font-medium" />
              </span>
              <span className="text-text-muted">vs promise {formatTimeRelative(s.promisedBy, simTime)}</span>
              {s.slackMinutes !== null ? (
                <span className={cn(s.slackMinutes < 0 ? 'text-danger' : 'text-text-secondary')}>{formatSlack(s.slackMinutes)}</span>
              ) : null}
              {s.confidence && s.confidence !== 'HIGH' ? <ConfidenceChip confidence={s.confidence} /> : null}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}
