import { useState } from 'react';
import { Link } from 'react-router';
import type { DriverHandover, DriverTripShipment, Milestone } from '../../api/contract';
import { useRecordMilestone, useTrip } from '../../api/hooks/portal';
import { useSync } from '../../api/sync';
import { Card, EmptyState, Skeleton } from '../../components/display/basics';
import { Banner, ErrorState, InlineError } from '../../components/display/feedback';
import { ArrowRightLeft, ChevronDown, ChevronRight, ICON_STROKE, MapPin, TriangleAlert, Truck } from '../../components/icons';
import { Button } from '../../components/primitives/Button';
import { Dialog } from '../../components/primitives/radix';
import { cn } from '../../components/cn';
import { milestoneLabel, nextStepAction, reasonLabel } from '../../i18n/en';
import { formatTime, formatTimeRelative } from '../../i18n/format';
import { MiniMap } from '../../map/MiniMap';

/**
 * Driver trip (UI plan §12.1; #21, #17, #10, #11). Mobile-first: one next-step card with a single
 * 56 px action, a confirmation sheet, the server's plain reason when blocked or rejected, hand-over
 * banners, the derived instruction, a collapsed mini map and a sticky "Report a problem".
 */
export default function TripPage() {
  const trip = useTrip();
  if (trip.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (trip.isError) return <ErrorState title="Couldn't load your trip" error={trip.error} onRetry={() => void trip.refetch()} />;
  const { items, recentHandovers } = trip.data;
  const current = items[0] ?? null;

  return (
    <div className="flex flex-col gap-4 pb-24">
      <h1 className="text-h1 text-text">My trip</h1>
      {recentHandovers.map((h) => (
        <HandoverBanner key={`${h.shipmentId}-${h.at}`} h={h} />
      ))}
      {current === null ? (
        <Card>
          <EmptyState icon={Truck} title="No trip assigned right now." help="Plant X will assign your next load here." />
        </Card>
      ) : (
        items.map((s) => <TripCard key={s.id} s={s} />)
      )}
      {current ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-[480px]">
            <Link
              to={`/trip/report?shipment=${encodeURIComponent(current.id)}`}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-danger/50 bg-surface text-body-lg font-semibold text-danger shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <TriangleAlert aria-hidden className="size-5 text-danger" strokeWidth={2} />
              Report a problem
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HandoverBanner({ h }: { h: DriverHandover }) {
  return (
    <Banner tone="info">
      <span className="inline-flex items-start gap-2">
        <ArrowRightLeft aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={ICON_STROKE} />
        <span>
          Load handed over to {h.toTruckCode} ({h.toDriverName}) at {formatTime(h.at)}. Your trip for {h.shipmentCode} has ended.
        </span>
      </span>
    </Banner>
  );
}

function TripCard({ s }: { s: DriverTripShipment }) {
  const { sync } = useSync();
  const [mapOpen, setMapOpen] = useState(false);
  return (
    <section aria-label={`Shipment ${s.code}`} className="flex flex-col gap-3">
      <p className="text-body-lg text-text">
        <span className="font-semibold code-label">{s.code}</span> · {s.customerName}, {s.city}
      </p>
      {s.instruction ? (
        <Banner tone="accent">
          <span className="font-medium">{s.instruction}</span>
        </Banner>
      ) : null}
      {s.stopped ? <Banner tone="warning">Truck is stopped. Plant X is aware.</Banner> : null}

      <NextStepCard s={s} />

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <dt className="text-small text-text-muted">Estimated arrival</dt>
          <dd className="text-body-lg font-semibold text-text tabular">{s.etaAt ? formatTimeRelative(s.etaAt, sync?.simTime) : '—'}</dd>
        </div>
        <div>
          <dt className="text-small text-text-muted">Promised by</dt>
          <dd className="text-body-lg font-semibold text-text tabular">{formatTimeRelative(s.promisedBy, sync?.simTime)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-small text-text-muted">Current step</dt>
          <dd className="text-body text-text">{milestoneLabel[s.currentMilestone]}</dd>
        </div>
      </dl>

      <div className="rounded-xl border border-border bg-surface">
        <button
          type="button"
          aria-expanded={mapOpen}
          onClick={() => setMapOpen((v) => !v)}
          className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-body text-text"
        >
          {mapOpen ? <ChevronDown aria-hidden className="size-5" strokeWidth={ICON_STROKE} /> : <ChevronRight aria-hidden className="size-5" strokeWidth={ICON_STROKE} />}
          <MapPin aria-hidden className="size-5 text-text-muted" strokeWidth={ICON_STROKE} />
          Route map
        </button>
        {mapOpen ? (
          <div className="px-2 pb-2">
            <MiniMap shipmentIds={[s.id]} ariaLabel={`Route map for ${s.code}`} />
          </div>
        ) : null}
      </div>

      {s.openReports.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-h3 text-text">Your reports</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {s.openReports.map((r) => (
              <li key={r.id} className="text-body text-text">
                {reasonLabel[r.reason]} · {formatTime(r.simTime)} · <span className="text-text-secondary">Pending review</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The one action on the screen. Blocked → disabled with the server's reason; tap → confirm → #17. */
function NextStepCard({ s }: { s: DriverTripShipment }) {
  const { sync } = useSync();
  const record = useRecordMilestone(s.id);
  const [confirming, setConfirming] = useState<Milestone | null>(null);
  const [done, setDone] = useState<Milestone | null>(null);
  const next = s.nextMilestone;
  const action = next ? nextStepAction[next] : undefined;
  const now = sync?.simTime ? formatTime(sync.simTime) : '';
  const title =
    next === 'ARRIVED' && s.canRecordNext ? `At ${s.customerName}'s gate — confirm arrival` : next ? milestoneLabel[next] : 'Trip complete';

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-strong bg-surface p-4 shadow-sm">
      <p className="eyebrow text-text-muted">Next step</p>
      <p className="text-h2 text-text">{title}</p>
      {done ? (
        <Banner tone="success" live>
          {milestoneLabel[done]} recorded.
        </Banner>
      ) : null}
      {next && action ? (
        <Button
          variant="primary"
          size="touch"
          fullWidth
          className="min-h-14"
          disabled={!s.canRecordNext}
          loading={record.isPending}
          onClick={() => {
            record.reset();
            setDone(null);
            setConfirming(next);
          }}
        >
          {action}
        </Button>
      ) : null}
      {s.nextBlockedReason ? <p className={cn('text-body', s.canRecordNext ? 'text-text-secondary' : 'font-medium text-text')}>{s.nextBlockedReason}</p> : null}
      {next === 'ARRIVED' ? <p className="text-small text-text-muted">The arrival time recorded is when the truck reached the gate, not when you tap.</p> : null}
      <InlineError error={record.error} />

      <Dialog
        open={confirming !== null}
        onOpenChange={(o) => {
          if (!o) setConfirming(null);
        }}
        title={confirming ? `${nextStepAction[confirming] ?? milestoneLabel[confirming]} at ${now}?` : ''}
        description={`Shipment ${s.code} · ${s.customerName}`}
        width="sm"
        footer={
          <>
            <Button size="touch" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              size="touch"
              variant="primary"
              loading={record.isPending}
              onClick={() => {
                const m = confirming;
                if (!m) return;
                record.mutate(
                  { milestone: m },
                  {
                    onSuccess: () => setDone(m),
                    onSettled: () => setConfirming(null),
                  },
                );
              }}
            >
              Confirm
            </Button>
          </>
        }
      />
    </div>
  );
}
