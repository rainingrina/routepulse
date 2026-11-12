import { Link, useParams } from 'react-router';
import type { AttributionResponse, EtaExplanationCoordinator, ShipmentDetailCoordinator, TimelineEvent } from '../../api/contract';
import { useAttribution, useEta, useShipmentDetail, useTimeline } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { Card, CardHeader, ConfidenceChip, EmptyState, KeyValue, PartyChip, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { StatusBadge, statusForShipment } from '../../components/display/StatusBadge';
import { ArrowLeft, Clock, History, ICON_STROKE } from '../../components/icons';
import { milestoneLabel, partyLabel, t } from '../../i18n/en';
import { formatDayTime, formatDuration, formatTime, formatTimeRelative } from '../../i18n/format';
import { RecoveryQuickSection } from '../recovery/RecoveryQuickSection';
import { FactorList } from './FactorList';
import { MilestoneStepper } from './Milestones';

/**
 * Coordinator shipment detail (UI plan §7; #15, #18, #34, #16). Every number is the API's: the
 * four ETA terms and factor bars come from #18, attribution rows from #34. Nothing is computed here.
 */
export default function ShipmentDetailPage() {
  const { id = '' } = useParams();
  const { sync } = useSync();
  const detail = useShipmentDetail(id);
  const shipment = detail.data?.shipment.view === 'coordinator' ? detail.data.shipment : null;
  const live = !!shipment && !shipment.arrivedAt;
  const eta = useEta(id, live);
  const attribution = useAttribution(shipment ? id : null);
  const timeline = useTimeline(shipment ? id : null);
  const etaData = eta.data?.eta.view === 'coordinator' ? eta.data.eta : null;

  if (detail.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (detail.isError || !shipment) {
    return <ErrorState title="Couldn't load this shipment" error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  const s = shipment;
  const status = statusForShipment(s);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-x-hidden p-4 lg:p-6">
      <Link to={`/control-tower?selected=${encodeURIComponent(s.id)}`} className="inline-flex items-center gap-1 self-start text-body text-primary hover:underline">
        <ArrowLeft aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
        {t.nav.controlTower}
      </Link>

      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h1 text-text code-label">{s.code}</h1>
          {status ? <StatusBadge status={status} /> : null}
          <span className="text-small text-text-muted">{milestoneLabel[s.currentMilestone]}</span>
          <span className="flex-1" />
          <Link to={`/shipments/${encodeURIComponent(s.id)}/replay`} className="inline-flex items-center gap-1 text-body text-primary hover:underline">
            <History aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
            Replay
          </Link>
        </div>
        <p className="text-body text-text-secondary">
          {s.customer.name}, {s.customer.city} · {s.lane.name} · order {s.orderCode}
        </p>
        <p className="text-small text-text-muted">
          {s.transporter.name}
          {s.transporter.isSmall ? ' (small fleet)' : ''}
          {s.truckCode ? ` · ${s.truckCode}` : ''}
          {s.driver ? ` · Driver ${s.driver.name}` : ''} · route {s.route.code} ({s.route.lengthKm} km)
        </p>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card aria-label="Estimated arrival">
            <CardHeader title="Arrival at the receiving gate" eyebrow={t.ruleBased} />
            <div className="p-4">
              {s.arrivedAt ? (
                <ArrivedOutcome s={s} />
              ) : eta.isPending ? (
                <Skeleton className="h-24" />
              ) : eta.isError ? (
                <ErrorState compact title="Couldn't load the estimate" error={eta.error} onRetry={() => void eta.refetch()} />
              ) : etaData ? (
                <EtaBreakdown eta={etaData} simTime={sync?.simTime} />
              ) : null}
            </div>
          </Card>

          <Card aria-label="Delay attribution">
            <CardHeader title="Delay attribution" eyebrow={attribution.data ? (attribution.data.status === 'FINAL' ? 'Final' : 'So far (live)') : undefined} />
            <div className="p-4">
              {attribution.isPending ? (
                <Skeleton className="h-24" />
              ) : attribution.isError ? (
                <ErrorState compact title="Couldn't load attribution" error={attribution.error} onRetry={() => void attribution.refetch()} />
              ) : (
                <AttributionTable a={attribution.data} />
              )}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card aria-label="Milestones">
            <CardHeader title="Milestones" titleAs="h2" />
            <div className="flex flex-col gap-3 p-4">
              <MilestoneStepper milestones={s.milestones} />
              <dl className="grid grid-cols-2 gap-3">
                <KeyValue label="Planned arrival">{formatDayTime(s.plannedArrivalAt)}</KeyValue>
                <KeyValue label="Promised by">{formatDayTime(s.promisedBy)}</KeyValue>
                <KeyValue label="Progress">{s.progressKm.toFixed(1)} km of {s.route.lengthKm}</KeyValue>
                <KeyValue label="Last update">{s.lastUpdateAt ? formatTimeRelative(s.lastUpdateAt, sync?.simTime) : 'No update yet'}</KeyValue>
                {s.stoppedUntil && s.stopped ? <KeyValue label="Stopped until">{formatDayTime(s.stoppedUntil)}</KeyValue> : null}
                {s.firstAtRiskAt ? <KeyValue label="First at risk">{formatDayTime(s.firstAtRiskAt)}</KeyValue> : null}
              </dl>
            </div>
          </Card>

          {etaData && (etaData.level === 'WATCH' || etaData.level === 'AT_RISK' || etaData.level === 'LATE') ? (
            <Card>
              <div className="p-4">
                <RecoveryQuickSection shipmentId={s.id} />
              </div>
            </Card>
          ) : null}

          <Card aria-label="Shipment activity">
            <CardHeader title="Activity" titleAs="h2" />
            <div className="p-4">
              {timeline.isPending ? (
                <Skeleton className="h-24" />
              ) : timeline.isError ? (
                <ErrorState compact title="Couldn't load the timeline" error={timeline.error} onRetry={() => void timeline.refetch()} />
              ) : (
                <Timeline items={timeline.data?.items ?? []} />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ArrivedOutcome({ s }: { s: ShipmentDetailCoordinator }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KeyValue label="Arrived (receiving gate)">{formatDayTime(s.arrivedAt as string)}</KeyValue>
      <KeyValue label="Promised by">{formatDayTime(s.promisedBy)}</KeyValue>
      <KeyValue label="Result">{s.onTime ? 'On time' : `Late by ${formatDuration(s.delayMinutes ?? 0)}`}</KeyValue>
      <KeyValue label="Delivered">{s.deliveredAt ? formatDayTime(s.deliveredAt) : 'Unloading in progress'}</KeyValue>
    </dl>
  );
}

/** The four-term identity (L3) exactly as returned: planned + so far + plan change + expected = predicted. */
export function EtaBreakdown({ eta, simTime }: { eta: EtaExplanationCoordinator; simTime: string | undefined }) {
  const rows: [string, string][] = [
    ['Planned arrival', formatDayTime(eta.plannedArrivalAt)],
    ['+ Delay so far', formatDuration(eta.totals.incurredMinutes)],
    ['+ Plan change', formatDuration(eta.totals.planChangeMinutes)],
    ['+ Expected delay', formatDuration(eta.totals.expectedMinutes)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        <dt className="text-small text-text-muted">Estimated arrival</dt>
        <dt className="text-small text-text-muted">Promised by</dt>
        <dt className="hidden text-small text-text-muted sm:block">Confidence</dt>
        <dd className="text-h2 text-text">
          <EtaDisplay at={eta.predictedArrivalAt} low={eta.etaLowAt} high={eta.etaHighAt} reference={simTime} />
        </dd>
        <dd className="text-h2 text-text tabular">{formatTimeRelative(eta.promisedBy, simTime)}</dd>
        <dd className="col-span-2 sm:col-span-1">
          <ConfidenceChip confidence={eta.confidence} />
        </dd>
      </dl>
      <p className="text-body text-text">{eta.summary}</p>
      <p className="text-small text-text-muted">{eta.confidenceReason}</p>
      <table className="w-full max-w-md text-body tabular" aria-label="ETA identity">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-border">
              <th scope="row" className="py-1 text-left font-normal text-text-secondary">{k}</th>
              <td className="py-1 text-right text-text">{v}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-1 text-left font-semibold text-text">= Predicted arrival</th>
            <td className="py-1 text-right font-semibold text-text">{formatDayTime(eta.predictedArrivalAt)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-small text-text-muted">
        Road arrival {formatTimeRelative(eta.projectedRoadArrivalAt, simTime)} · receiving {formatTime(eta.receivingWindow.opensAt)}–{formatTime(eta.receivingWindow.closesAt)}
        {eta.identityHolds ? '' : ' · identity check failed'}
      </p>
      <div>
        <h3 className="overline mb-2 text-text-muted">Why this estimate</h3>
        <FactorList factors={eta.factors} />
      </div>
    </div>
  );
}

/** Attribution rows (#34) — "attributed to", never "fault". GAP rows are shown, never hidden. */
export function AttributionTable({ a }: { a: AttributionResponse | undefined }) {
  if (!a || a.rows.length === 0) return <EmptyState icon={Clock} title="No delay recorded" help="Delay minutes appear here as they are incurred." className="py-6" />;
  const parties = (Object.entries(a.totalsByParty) as [keyof typeof partyLabel, number][]).filter(([, m]) => m > 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" aria-label="Minutes by party">
        {parties.map(([p, m]) => (
          <span key={p} className="inline-flex items-center gap-1.5 text-small text-text">
            <PartyChip party={p} /> {formatDuration(m)}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-body tabular">
          <thead>
            <tr className="border-b border-border text-left text-small text-text-muted">
              <th className="py-1 font-medium">Cause</th>
              <th className="py-1 font-medium">Attributed to</th>
              <th className="py-1 text-right font-medium">Minutes</th>
            </tr>
          </thead>
          <tbody>
            {a.rows.map((r) => (
              <tr key={r.id} className="border-b border-border align-top">
                <td className="py-1.5 pr-2 text-text">
                  {r.label}
                  {r.overrideNote ? (
                    <span className="block text-small text-text-muted">
                      Changed from {r.originalParty ? partyLabel[r.originalParty] : '—'}{r.overriddenBy ? ` by ${r.overriddenBy.name}` : ''}: {r.overrideNote}
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2">
                  <PartyChip party={r.party} />
                </td>
                <td className="py-1.5 text-right text-text">{r.minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.delayMinutes !== null ? (
        <p className="text-small text-text-secondary">
          {a.delayMinutes > 0 ? `Arrived ${formatDuration(a.delayMinutes)} after the promise.` : 'Arrived on time.'}{' '}
          {a.countsAgainstTransporter === null ? '' : a.countsAgainstTransporter ? 'Counts against the transporter.' : 'Does not count against the transporter.'} {a.ruleText}
        </p>
      ) : (
        <p className="text-small text-text-muted">Live — rows become final at arrival at the receiving gate.</p>
      )}
    </div>
  );
}

function Timeline({ items }: { items: TimelineEvent[] }) {
  if (items.length === 0) return <p className="text-body text-text-secondary">No events yet.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {[...items].reverse().map((e) => (
        <li key={e.id} className="flex gap-3 text-body">
          <span className="w-24 shrink-0 text-small text-text-muted tabular">{formatDayTime(e.simTime)}</span>
          <span className="min-w-0 text-text">
            {e.summary}
            {e.actorName ? <span className="text-text-muted"> · {e.actorName}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
