import { Link, useParams } from 'react-router';
import type { AttributionResponse, EtaExplanationCoordinator, ShipmentDetailCoordinator, TimelineEvent } from '../../api/contract';
import { useAttribution, useEta, useShipmentDetail, useTimeline } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { Badge, Card, CardHeader, ConfidenceChip, EmptyState, KeyValue, PartyChip, Skeleton } from '../../components/display/basics';
import { Breadcrumbs } from '../../components/primitives/radix';
import { ErrorState } from '../../components/display/feedback';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { StatusBadge, statusForShipment } from '../../components/display/StatusBadge';
import { Clock, History, ICON_STROKE } from '../../components/icons';
import { milestoneLabel, partyLabel, t } from '../../i18n/en';
import { formatDayTime, formatDuration, formatTime, formatTimeRelative } from '../../i18n/format';
import { RecoveryQuickSection } from '../recovery/RecoveryQuickSection';
import { FactorList } from './FactorList';
import { EtaWaterfall } from './EtaWaterfall';
import { DecisionBrief } from './DecisionBrief';
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
      <Breadcrumbs items={[{ label: t.nav.controlTower, to: `/control-tower?selected=${encodeURIComponent(s.id)}` }, { label: s.code }]} />

      <header className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs lg:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h1 text-text code-label">{s.code}</h1>
          {status ? <StatusBadge status={status} /> : null}
          <Badge>{milestoneLabel[s.currentMilestone]}</Badge>
          {s.renegotiated ? <Badge tone="accent">New window agreed</Badge> : null}
          <span className="flex-1" />
          <Link
            to={`/shipments/${encodeURIComponent(s.id)}/replay`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-body font-medium text-text hover:bg-surface-subtle"
          >
            <History aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
            Replay
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 xl:grid-cols-6">
          <KeyValue label="Customer">
            {s.customer.name}, {s.customer.city}
          </KeyValue>
          <KeyValue label="Order">{s.orderCode}</KeyValue>
          <KeyValue label="Lane">{s.lane.name}</KeyValue>
          <KeyValue label="Transporter">
            {s.transporter.name}
            {s.transporter.isSmall ? <span className="text-text-muted"> · small fleet</span> : null}
          </KeyValue>
          <KeyValue label="Truck and driver">
            {s.truckCode ?? '—'}
            {s.driver ? ` · ${s.driver.name}` : ''}
          </KeyValue>
          <KeyValue label="Route">
            {s.route.code} · {s.route.lengthKm} km
          </KeyValue>
        </dl>
      </header>

      <DecisionBrief shipment={s} eta={etaData} etaPending={live && eta.isPending} attribution={attribution.data ?? null} simTime={sync?.simTime} />

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
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KeyValue label="Arrived (receiving gate)">{formatDayTime(s.arrivedAt as string)}</KeyValue>
      <KeyValue label="Promised by">{formatDayTime(s.promisedBy)}</KeyValue>
      <KeyValue label="Result">{s.onTime ? 'On time' : `Late by ${formatDuration(s.delayMinutes ?? 0)}`}</KeyValue>
      <KeyValue label="Delivered">{s.deliveredAt ? formatDayTime(s.deliveredAt) : 'Unloading in progress'}</KeyValue>
    </dl>
  );
}

/** The four-term identity (L3) exactly as returned: planned + so far + plan change + expected = predicted. */
export function EtaBreakdown({ eta, simTime }: { eta: EtaExplanationCoordinator; simTime: string | undefined }) {
  const terms: { key: string; label: string; minutes: number }[] = [
    { key: 'incurred', label: 'Delay so far', minutes: eta.totals.incurredMinutes },
    { key: 'plan', label: 'Plan change', minutes: eta.totals.planChangeMinutes },
    { key: 'expected', label: 'Expected delay', minutes: eta.totals.expectedMinutes },
  ];
  const signed = (m: number) => `${m < 0 ? '−' : '+'}${formatDuration(m)}`;
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KeyValue label="Estimated arrival" className="col-span-2">
          <span className="text-h1 text-text">
            <EtaDisplay at={eta.predictedArrivalAt} low={eta.etaLowAt} high={eta.etaHighAt} reference={simTime} />
          </span>
        </KeyValue>
        <KeyValue label="Promised by">
          <span className="text-h2 text-text tabular">{formatTimeRelative(eta.promisedBy, simTime)}</span>
        </KeyValue>
        <KeyValue label="Confidence">
          <ConfidenceChip confidence={eta.confidence} />
        </KeyValue>
      </dl>
      <div>
        <p className="text-body text-text">{eta.summary}</p>
        <p className="mt-0.5 text-small text-text-muted">{eta.confidenceReason}</p>
      </div>

      {/* The four-term identity (L3), exactly as returned: planned + so far + plan change + expected = predicted. */}
      <div className="rounded-xl border border-border bg-surface-subtle p-3">
        <ol className="grid grid-cols-2 gap-2 md:grid-cols-5" aria-label="How the estimate adds up">
          <li className="rounded-lg bg-surface px-3 py-2 shadow-xs">
            <p className="text-small text-text-muted">Planned arrival</p>
            <p className="text-body font-semibold text-text tabular">{formatDayTime(eta.plannedArrivalAt)}</p>
          </li>
          {terms.map((t) => (
            <li key={t.key} className="rounded-lg bg-surface px-3 py-2 shadow-xs">
              <p className="text-small text-text-muted">{t.label}</p>
              <p className="text-body font-semibold text-text tabular">{signed(t.minutes)}</p>
            </li>
          ))}
          <li className="col-span-2 rounded-lg bg-ink-900 px-3 py-2 text-on-primary md:col-span-1">
            <p className="text-small text-sage-muted">= Predicted</p>
            <p className="text-body font-semibold tabular">{formatDayTime(eta.predictedArrivalAt)}</p>
          </li>
        </ol>
        <table className="sr-only" aria-label="ETA identity">
          <tbody>
            <tr>
              <th scope="row">Planned arrival</th>
              <td>{formatDayTime(eta.plannedArrivalAt)}</td>
            </tr>
            <tr>
              <th scope="row">+ Delay so far</th>
              <td>{formatDuration(eta.totals.incurredMinutes)}</td>
            </tr>
            <tr>
              <th scope="row">+ Plan change</th>
              <td>{formatDuration(eta.totals.planChangeMinutes)}</td>
            </tr>
            <tr>
              <th scope="row">+ Expected delay</th>
              <td>{formatDuration(eta.totals.expectedMinutes)}</td>
            </tr>
            <tr>
              <th scope="row">= Predicted arrival</th>
              <td>{formatDayTime(eta.predictedArrivalAt)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EtaWaterfall eta={eta} />
      <p className="text-small text-text-muted">
        Arrival means the receiving gate (not unloading). Road arrival {formatTimeRelative(eta.projectedRoadArrivalAt, simTime)} · receiving {formatTime(eta.receivingWindow.opensAt)}–{formatTime(eta.receivingWindow.closesAt)}
        {eta.identityHolds ? '' : ' · identity check failed'}
      </p>
      <div>
        <h3 className="mb-2 text-h3 text-text">Why this estimate</h3>
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
