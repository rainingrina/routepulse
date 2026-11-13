import type { ReactNode } from 'react';
import type { AlertDtoCoordinator, AttributionResponse, EtaExplanationCoordinator, ShipmentDetailCoordinator } from '../../api/contract';
import { useReplay } from '../../api/hooks/portal';
import { useAlerts, useDriverReports, useRecoveryOptions } from '../../api/hooks/world';
import { Badge, Card, PartyChip, Skeleton } from '../../components/display/basics';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { StatusBadge, statusForShipment } from '../../components/display/StatusBadge';
import { cn } from '../../components/cn';
import { Bell, CircleCheck, FileText, Route, TriangleAlert, ICON_STROKE, type LucideIcon } from '../../components/icons';
import { customerResponseLabel, reasonLabel, recoveryKindLabel, partyLabel } from '../../i18n/en';
import { formatDayTime, formatDuration, formatInr, formatSlack } from '../../i18n/format';
import { buildDecisionBrief, type BriefContributor, type DecisionBriefModel } from './briefModel';
import { signedMinutes } from './EtaWaterfall';

const PHASE_TAG: Record<BriefContributor['phase'], string> = { INCURRED: 'So far', PLAN_CHANGE: 'Plan change', EXPECTED: 'Expected', FINAL: 'Final' };

/**
 * Shipment Decision Brief (coordinator detail page): status, why, incident, recovery decision and
 * customer communication in one card. Data: #15 (passed in), #18 / #34 (passed in), #24 (both
 * statuses), #26 (active + resolved), #29 (cached by the recovery section) and #19 (only after a
 * recovery was chosen). Facts carry their recorded time; estimates are labelled.
 */
export function DecisionBrief({
  shipment,
  eta,
  etaPending,
  attribution,
  simTime,
}: {
  shipment: ShipmentDetailCoordinator;
  eta: EtaExplanationCoordinator | null;
  etaPending: boolean;
  attribution: AttributionResponse | null;
  simTime: string | undefined;
}) {
  const id = shipment.id;
  const live = !shipment.arrivedAt;
  const activeAlerts = useAlerts({ shipmentId: id, status: 'active' });
  const resolvedAlerts = useAlerts({ shipmentId: id, status: 'RESOLVED' });
  const pendingReports = useDriverReports({ shipmentId: id, status: 'PENDING_REVIEW' });
  const confirmedReports = useDriverReports({ shipmentId: id, status: 'CONFIRMED' });
  const options = useRecoveryOptions(id, live);

  const alerts = [...(activeAlerts.data?.items ?? []), ...(resolvedAlerts.data?.items ?? [])].filter((a): a is AlertDtoCoordinator => a.view === 'coordinator');
  const hasChosen = alerts.some((a) => a.chosenOption) || (options.data?.options ?? []).some((o) => o.status === 'CHOSEN');
  const replay = useReplay(hasChosen ? id : null);

  const brief = buildDecisionBrief({
    shipment,
    eta,
    attribution,
    reports: [...(pendingReports.data?.items ?? []), ...(confirmedReports.data?.items ?? [])],
    alerts,
    options: options.data?.options ?? [],
    snapshots: replay.data?.snapshots ?? null,
  });

  const alertsState = activeAlerts.isError || resolvedAlerts.isError ? 'error' : activeAlerts.isPending || resolvedAlerts.isPending ? 'pending' : 'ok';
  const reportsState = pendingReports.isError || confirmedReports.isError ? 'error' : pendingReports.isPending || confirmedReports.isPending ? 'pending' : 'ok';

  return (
    <Card aria-labelledby="decision-brief-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <div>
          <p className="eyebrow text-text-muted">Decision brief</p>
          <h2 id="decision-brief-title" className="text-h3 text-text">
            {shipment.code} — what is happening and what was decided
          </h2>
        </div>
        <p className="text-small text-text-muted">Recorded facts show their time · estimates are rule-based</p>
      </div>

      <StatusStrip b={brief} simTime={simTime} />

      <div className="grid gap-px bg-border md:grid-cols-2">
        <Section icon={TriangleAlert} title={whyTitle(brief)}>
          <WhySection b={brief} pending={live ? etaPending : !attribution} />
        </Section>
        <Section icon={FileText} title="Reported incident">
          {reportsState === 'pending' ? <Skeleton className="h-16" /> : reportsState === 'error' ? <Unavailable what="driver reports" /> : <IncidentSection b={brief} />}
        </Section>
        <Section icon={Route} title="Recovery decision">
          {alertsState === 'pending' ? <Skeleton className="h-16" /> : alertsState === 'error' ? <Unavailable what="alerts" /> : <RecoverySection b={brief} replayPending={hasChosen && replay.isPending} />}
        </Section>
        <Section icon={Bell} title="Customer communication">
          <CustomerSection b={brief} />
        </Section>
      </div>
    </Card>
  );
}

function whyTitle(b: DecisionBriefModel): string {
  if (b.status.arrived) return 'Delay against the plan (final)';
  if (b.status.level === 'AT_RISK') return 'Why is this shipment at risk?';
  if (b.status.level === 'LATE') return 'Why is this shipment late?';
  if (b.status.level === 'WATCH') return 'Why is this shipment on watch?';
  return 'What affects the estimate';
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 bg-surface p-4" aria-label={title}>
      <h3 className="flex items-center gap-1.5 text-body font-semibold text-text">
        <Icon aria-hidden className="size-4 text-text-muted" strokeWidth={ICON_STROKE} />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <dt className="text-small text-text-muted">{label}</dt>
      <dd className="text-body text-text">{children}</dd>
    </div>
  );
}

function Unavailable({ what }: { what: string }) {
  return <p className="text-body text-text-secondary">Not available — couldn’t load {what}. The rest of the page is unaffected.</p>;
}

function StatusStrip({ b, simTime }: { b: DecisionBriefModel; simTime: string | undefined }) {
  const st = b.status;
  const kind = statusForShipment({ deliveredAt: null, arrivedAt: st.arrivedAt, riskLevel: st.level });
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-4 py-3 md:grid-cols-4">
      <Fact label="Status">{kind ? <StatusBadge status={kind} /> : <span className="text-text-muted">Not assessed yet</span>}</Fact>
      {st.arrived ? (
        <>
          <Fact label="Arrived (receiving gate)">
            <span className="font-semibold tabular">{formatDayTime(st.arrivedAt as string)}</span>
          </Fact>
          <Fact label="Promised by">
            <span className="tabular">{formatDayTime(st.promisedBy)}</span>
          </Fact>
          <Fact label="Result">
            {st.onTime === null ? (
              <span className="text-text-muted">Not recorded</span>
            ) : st.onTime ? (
              <span className="text-success">On time</span>
            ) : (
              <span className="text-danger">Late{st.delayMinutes ? ` by ${formatDuration(st.delayMinutes)}` : ''}</span>
            )}
          </Fact>
        </>
      ) : (
        <>
          <Fact label="Estimated arrival (rule-based)">
            <span className="font-semibold">
              <EtaDisplay at={st.etaAt} low={st.etaLowAt} high={st.etaHighAt} reference={simTime} />
            </span>
          </Fact>
          <Fact label="Promised by">
            <span className="tabular">{formatDayTime(st.promisedBy)}</span>
          </Fact>
          <Fact label="Estimate vs promise">
            {st.slackMinutes === null ? (
              <span className="text-text-muted">Not available</span>
            ) : (
              <span className={cn('tabular', st.slackMinutes < 0 ? 'font-medium text-danger' : 'text-text')}>{formatSlack(st.slackMinutes)}</span>
            )}
          </Fact>
        </>
      )}
    </dl>
  );
}

function WhySection({ b, pending }: { b: DecisionBriefModel; pending: boolean }) {
  if (pending) return <Skeleton className="h-20" />;
  const w = b.why;
  if (w.source === 'NONE' || w.top.length === 0) {
    return <p className="text-body text-text-secondary">{b.status.arrived ? 'No delay against the plan was attributed.' : 'No delay contributors — the estimate equals the plan.'}</p>;
  }
  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {w.top.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-start gap-2 py-1.5 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="text-body text-text">{c.label}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-muted">
                <span>{PHASE_TAG[c.phase]}</span>
                {c.party ? <PartyChip party={c.party} /> : <span>Knock-on (several parties)</span>}
                {c.pendingReview ? <Badge tone="warning">Pending review</Badge> : null}
              </p>
            </div>
            <span className="shrink-0 text-body font-semibold text-text tabular">{signedMinutes(c.minutes)}</span>
          </li>
        ))}
      </ul>
      <p className="text-small text-text-muted">
        {w.totals
          ? `So far ${signedMinutes(w.totals.incurred)} (incurred) · expected ${signedMinutes(w.totals.expected)}${w.totals.planChange !== 0 ? ` · plan change ${signedMinutes(w.totals.planChange)}` : ''}`
          : 'Final attribution after arrival'}
        {w.moreCount > 0 ? ` · ${w.moreCount} smaller ${w.moreCount === 1 ? 'factor' : 'factors'} below` : ''}
      </p>
    </>
  );
}

function IncidentSection({ b }: { b: DecisionBriefModel }) {
  const i = b.incident;
  if (!i) return <p className="text-body text-text-secondary">No driver incident reported.</p>;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-medium text-text">{reasonLabel[i.reason]}</span>
        {i.status === 'PENDING_REVIEW' ? <Badge tone="warning">Pending review</Badge> : <Badge tone="success" icon={CircleCheck}>Confirmed</Badge>}
      </div>
      {i.text ? <blockquote className="rounded-lg bg-surface-subtle px-3 py-2 text-body text-text">“{i.text}”</blockquote> : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Fact label="Reported">
          <span className="tabular">{formatDayTime(i.reportedAt)}</span> · {i.reporterName}
        </Fact>
        <Fact label="Driver’s estimate">{i.estimatedMinutes ? formatDuration(i.estimatedMinutes) : <span className="text-text-muted">Not given</span>}</Fact>
        {/* The report's own assumption (#24 appliedMinutes); a later decision can change what remains of it in the estimate. */}
        <Fact label="Report’s delay assumption">{formatDuration(i.appliedMinutes)}</Fact>
        {i.driverPicked && i.driverPicked !== i.reason ? <Fact label="Driver picked">{reasonLabel[i.driverPicked]}</Fact> : null}
      </dl>
      {i.status === 'CONFIRMED' ? (
        <p className="text-small text-text-muted">
          Confirmed{i.reviewedBy ? ` by ${i.reviewedBy}` : ''}
          {i.reviewedAt ? ` · ${formatDayTime(i.reviewedAt)}` : ''}
          {i.changedFrom ? ` · changed from ${i.changedFrom.reason ? reasonLabel[i.changedFrom.reason] : reasonLabel[i.reason]}${i.changedFrom.party ? ` / ${partyLabel[i.changedFrom.party]}` : ''}` : ''}
        </p>
      ) : null}
      {i.otherReports > 0 ? <p className="text-small text-text-muted">{i.otherReports} earlier {i.otherReports === 1 ? 'report' : 'reports'} on this shipment</p> : null}
    </>
  );
}

function RecoverySection({ b, replayPending }: { b: DecisionBriefModel; replayPending: boolean }) {
  const r = b.recovery;
  if (r.state === 'NONE') return <p className="text-body text-text-secondary">{b.status.arrived ? 'No recovery action was selected.' : 'No recovery action selected yet.'}</p>;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-medium text-text">{r.title}</span>
        {r.state === 'CHOSEN' ? <Badge tone="success" icon={CircleCheck}>Selected</Badge> : <Badge tone="warning">Proposed · awaiting customer</Badge>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Fact label="Action">{r.kind ? recoveryKindLabel[r.kind] : '—'}</Fact>
        <Fact label="Time saved vs notify only (estimate)">{r.minutesSavedVsNotify !== null ? formatDuration(r.minutesSavedVsNotify) : '—'}</Fact>
        <Fact label="Extra cost (estimate)">
          {r.extraCostInr !== null ? formatInr(r.extraCostInr) : '—'}
          {r.costNote ? <span className="block text-small text-text-muted">{r.costNote}</span> : null}
        </Fact>
        {r.state === 'CHOSEN' ? (
          <Fact label="Decided">
            {r.decidedBy ? (
              <>
                {r.decidedBy}
                {r.decidedAt ? <span className="tabular"> · {formatDayTime(r.decidedAt)}</span> : null}
              </>
            ) : (
              <span className="text-text-muted">Decision maker not recorded</span>
            )}
          </Fact>
        ) : null}
      </dl>
      {r.state === 'CHOSEN' ? <EtaChange b={b} pending={replayPending} /> : null}
    </>
  );
}

/** Before → after the decision, from recorded replay snapshots only; omitted when not recorded. */
function EtaChange({ b, pending }: { b: DecisionBriefModel; pending: boolean }) {
  if (pending) return <Skeleton className="h-10" />;
  const c = b.etaChange;
  if (!c) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2" aria-label="Estimated arrival before and after the decision">
      <p className="text-small text-text-muted">Estimated arrival (recorded snapshots)</p>
      <p className="flex flex-wrap items-baseline gap-x-2 text-body text-text tabular">
        <span>
          {formatDayTime(c.beforeAt)} <span className="text-small text-text-muted">before · recorded {formatDayTime(c.beforeRecordedAt)}</span>
        </span>
        <span aria-hidden>→</span>
        <span className="sr-only">then</span>
        <span>
          <span className="font-semibold">{formatDayTime(c.afterAt)}</span> <span className="text-small text-text-muted">after · {formatDayTime(c.decisionRecordedAt)}</span>
        </span>
        <span className={cn('font-medium', c.deltaMinutes < 0 ? 'text-success' : c.deltaMinutes > 0 ? 'text-danger' : 'text-text-muted')}>
          {c.deltaMinutes === 0 ? 'no change' : `${c.deltaMinutes < 0 ? '−' : '+'}${formatDuration(c.deltaMinutes)}`}
        </span>
      </p>
    </div>
  );
}

function CustomerSection({ b }: { b: DecisionBriefModel }) {
  const c = b.customer;
  return (
    <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-4 md:grid-cols-1 xl:grid-cols-2">
      <Fact label="Notified">
        {c.notifiedAt ? (
          <>
            <span className="tabular">{formatDayTime(c.notifiedAt)}</span> · in-app notification created
            <span className="block text-small text-text-muted">Delivery and read status are not tracked</span>
          </>
        ) : (
          <span className="text-text-secondary">{b.status.arrived ? 'Not notified' : 'Not notified yet'}</span>
        )}
      </Fact>
      <Fact label="Customer response">
        {c.response ? (
          <>
            {customerResponseLabel[c.response]}
            {c.respondedAt ? <span className="tabular"> · {formatDayTime(c.respondedAt)}</span> : null}
          </>
        ) : (
          <span className="text-text-secondary">{b.status.arrived ? 'No response' : 'No response yet'}</span>
        )}
      </Fact>
    </dl>
  );
}
