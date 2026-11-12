import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DASHBOARD_PERIODS, type DashboardPeriod, type DashboardQuery, type DashboardResponse, type ShipmentListItemCoordinator } from '../../api/contract';
import { useDashboard, useReference, useShipments } from '../../api/hooks/world';
import { Badge, Card, CardHeader, EmptyState, PartyChip, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { KpiCard } from '../../components/display/KpiCard';
import { Inbox } from '../../components/icons';
import { Button } from '../../components/primitives/Button';
import { Dialog, SegmentedControl, Tooltip } from '../../components/primitives/radix';
import { selectClassSm } from '../../components/primitives/fieldStyles';
import { partyLabel, reasonLabel, t } from '../../i18n/en';
import { formatDayTime, formatDuration, formatInt, formatPct } from '../../i18n/format';
import { ChartCard, OnTimeBars, PartyShareBars, ReasonBars, SimpleTable, WeeklyOnTimeChart, WeeklyVolumeChart, weekLabel } from './charts';

/** Filter state lives in the URL (?period=&laneId=&transporterId=) so a view can be shared and reloaded. */
export function dashboardQueryFrom(params: URLSearchParams): DashboardQuery {
  const p = params.get('period');
  const q: DashboardQuery = { period: (DASHBOARD_PERIODS as readonly string[]).includes(p ?? '') ? (p as DashboardPeriod) : '30d' };
  const lane = params.get('laneId');
  const transporter = params.get('transporterId');
  if (lane) q.laneId = lane;
  if (transporter) q.transporterId = transporter;
  return q;
}

type Drill = { title: string; laneId?: string; transporterId?: string } | null;

/**
 * Analytics dashboard (UI plan §13; #36, #38, #14). One request per filter change, so every chart
 * comes from the same filtered set (AC-M5.3). Fictional seeded data, labelled as such.
 */
export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const query = dashboardQueryFrom(params);
  const dash = useDashboard(query);
  const reference = useReference();
  const [drill, setDrill] = useState<Drill>(null);

  const setFilter = (key: 'period' | 'laneId' | 'transporterId', value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const filtered = !!query.laneId || !!query.transporterId;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="z-10 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur md:sticky md:top-0 xl:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <h1 className="mr-2 text-h2 text-text">Dashboard</h1>
          <SegmentedControl<DashboardPeriod>
            label="Period"
            value={query.period ?? '30d'}
            onChange={(v) => setFilter('period', v)}
            options={DASHBOARD_PERIODS.map((p) => ({ value: p, label: p.replace('d', ' d'), ariaLabel: `Last ${p.replace('d', ' days')}` }))}
          />
          <label className="flex items-center gap-1.5 text-small text-text-secondary">
            Lane
            <select className={selectClassSm} value={query.laneId ?? ''} onChange={(e) => setFilter('laneId', e.target.value || null)}>
              <option value="">All lanes</option>
              {(reference.data?.lanes ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-small text-text-secondary">
            Transporter
            <select className={selectClassSm} value={query.transporterId ?? ''} onChange={(e) => setFilter('transporterId', e.target.value || null)}>
              <option value="">All transporters</option>
              {(reference.data?.transporters ?? []).map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
            </select>
          </label>
          {filtered ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('laneId');
                next.delete('transporterId');
                setParams(next, { replace: true });
              }}
            >
              Clear filters
            </Button>
          ) : null}
          <span className="flex-1" />
          <span className="text-small text-text-muted">
            {dash.data ? `${formatDayTime(dash.data.filter.from)} – ${formatDayTime(dash.data.filter.to)} · ` : ''}by arrival at the receiving gate · {t.fictionalNotice}
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 xl:px-6">
        {dash.isPending ? (
          <>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 7 }, (_, i) => (
                <Skeleton key={i} className="h-20 min-w-[148px] flex-1" />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </>
        ) : dash.isError ? (
          <ErrorState title="Couldn't load the dashboard" error={dash.error} onRetry={() => void dash.refetch()} />
        ) : (
          <DashboardBody d={dash.data} filtered={filtered} refreshing={dash.isFetching && dash.isPlaceholderData} onDrill={setDrill} onClear={() => setParams(new URLSearchParams({ period: query.period ?? '30d' }), { replace: true })} />
        )}
      </div>
      {drill && dash.data ? <DrillDown drill={drill} d={dash.data} onClose={() => setDrill(null)} /> : null}
    </div>
  );
}

function DashboardBody({ d, filtered, refreshing, onDrill, onClear }: { d: DashboardResponse; filtered: boolean; refreshing: boolean; onDrill: (x: Drill) => void; onClear: () => void }) {
  const k = d.kpis;
  if (d.arrivedCount === 0) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title="No deliveries match these filters"
          help="No shipment arrived at a receiving gate in this period for the chosen lane and transporter."
          action={filtered ? <Button onClick={onClear}>Clear filters</Button> : undefined}
        />
      </Card>
    );
  }
  return (
    <div className={refreshing ? 'flex flex-col gap-4 opacity-70 transition-opacity' : 'flex flex-col gap-4'} aria-busy={refreshing || undefined}>
      <div className="flex flex-wrap gap-3" role="group" aria-label="Key figures">
        <Tooltip content={d.definitions.onTime}>
          <div className="flex min-w-[148px] flex-1">
            <KpiCard label="On time" value={formatPct(k.onTimePct)} caption={`${formatInt(d.arrivedCount - k.lateCount)} of ${formatInt(d.arrivedCount)} arrived`} />
          </div>
        </Tooltip>
        <KpiCard label="Arrived" value={formatInt(d.arrivedCount)} caption={`${formatInt(k.lateCount)} late`} onClick={() => onDrill({ title: 'All arrived shipments' })} title="List these shipments" />
        <KpiCard label="Median delay (late)" value={k.medianDelayMinutesOfLate === null ? '—' : formatDuration(k.medianDelayMinutesOfLate)} caption="Beyond the agreed promise" />
        <Tooltip content={d.definitions.warningLead}>
          <div className="flex min-w-[148px] flex-1">
            <KpiCard
              label="Median warning lead"
              value={k.medianWarningLeadMinutes === null ? '—' : `${k.medianWarningLeadMinutes < 0 ? '−' : ''}${formatDuration(k.medianWarningLeadMinutes)}`}
              caption={k.medianWarningLeadMinutes === null ? 'No shipment reached At risk' : k.medianWarningLeadMinutes < 0 ? 'After the promised time' : 'Before the promised time'}
            />
          </div>
        </Tooltip>
        <Tooltip content={d.definitions.proactiveNotice}>
          <div className="flex min-w-[148px] flex-1">
            <KpiCard label="Proactive notice" value={formatPct(k.proactiveNoticeRatePct)} caption="Told before the promise" />
          </div>
        </Tooltip>
        <Tooltip content={d.definitions.recovered}>
          <div className="flex min-w-[148px] flex-1">
            <KpiCard label="Recovered" value={formatPct(k.recoveredPct)} caption="At risk, action, on time" />
          </div>
        </Tooltip>
        <KpiCard label="Renegotiated" value={formatInt(k.renegotiatedCount)} caption="Counted in on-time %" />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <ChartCard
          label="On-time by lane"
          title="On-time % by lane"
          definition={d.definitions.onTime}
          chart={<OnTimeBars ariaLabel="On-time percentage by lane" data={d.onTimeByLane.map((l) => ({ name: l.laneName, onTimePct: l.onTimePct, delivered: l.delivered }))} />}
          table={
            <SimpleTable
              caption="On-time by lane"
              head={['Lane', 'Arrived', 'On time', 'On-time %']}
              rows={d.onTimeByLane.map((l) => [
                <button key="n" type="button" className="link" onClick={() => onDrill({ title: l.laneName, laneId: l.laneId })}>
                  {l.laneName}
                </button>,
                formatInt(l.delivered),
                formatInt(l.onTime),
                formatPct(l.onTimePct),
              ])}
            />
          }
        />
        <ChartCard
          label="On-time by transporter"
          title="On-time % by transporter"
          definition={d.definitions.onTime}
          chart={<OnTimeBars ariaLabel="On-time percentage by transporter" data={d.onTimeByTransporter.map((x) => ({ name: x.name, onTimePct: x.onTimePct, delivered: x.delivered }))} />}
          table={
            <SimpleTable
              caption="On-time by transporter"
              head={['Transporter', 'Arrived', 'On time', 'On-time %']}
              rows={d.onTimeByTransporter.map((x) => [`${x.name}${x.isSmall ? ' (small fleet)' : ''}`, formatInt(x.delivered), formatInt(x.onTime), formatPct(x.onTimePct)])}
            />
          }
        />
        <ChartCard
          label="Weekly on-time trend"
          title="Weekly on-time trend"
          definition="Calendar weeks from Monday 00:00 IST; the first and last week of the period can be partial."
          chart={<WeeklyOnTimeChart weeks={d.weeklyTrend} />}
          table={<WeeklyTable d={d} />}
        />
        <ChartCard
          label="Arrivals per week"
          title="Shipments arrived per week"
          definition="Shipment volume: arrivals at the receiving gate in each week of the period."
          chart={<WeeklyVolumeChart weeks={d.weeklyTrend} />}
          table={<WeeklyTable d={d} />}
        />
        <ChartCard
          label="Delay minutes by party"
          title="Delay minutes by party"
          definition={`All attributed delay minutes of the ${formatInt(d.arrivedCount)} arrived shipments (vs plan), per lane. Overall: ${d.causesByParty.map((c) => `${partyLabel[c.party]} ${formatPct(c.sharePct)}`).join(' · ')}.`}
          chart={<PartyShareBars ariaLabel="Share of delay minutes by party per lane" rows={d.causesByLane.map((l) => ({ name: l.laneName, byParty: l.byParty }))} />}
          table={
            <SimpleTable
              caption="Delay minutes by party"
              head={['Party', 'Minutes', 'Share']}
              rows={d.causesByParty.map((c) => [<PartyChip key="p" party={c.party} />, formatInt(c.minutes), formatPct(c.sharePct)])}
            />
          }
        />
        <ChartCard
          label="Delay causes by reason"
          title="Delay causes by reason"
          definition="Attributed minutes by recorded reason and party, largest first. Unexplained (GAP) minutes have no reason and appear under Unattributed by party only."
          chart={d.causesByReason.length ? <ReasonBars rows={d.causesByReason} /> : <p className="text-body text-text-muted">No delay minutes recorded.</p>}
          table={
            <SimpleTable
              caption="Delay causes by reason"
              head={['Reason', 'Party', 'Minutes']}
              rows={d.causesByReason.map((c) => [reasonLabel[c.reason], partyLabel[c.party], formatInt(c.minutes)])}
            />
          }
        />
      </div>

      <TransporterTable d={d} onDrill={onDrill} />
      <p className="text-small text-text-muted">
        {d.dataNote} Generated at simulation time {formatDayTime(d.generatedAtSim)}. Rule-based attribution; on-time is measured against the agreed promise.
      </p>
    </div>
  );
}

function WeeklyTable({ d }: { d: DashboardResponse }) {
  return (
    <SimpleTable
      caption="Weekly trend"
      head={['Week', 'Arrived', 'On-time %']}
      rows={d.weeklyTrend.map((w) => [weekLabel(w.weekStart), formatInt(w.delivered), formatPct(w.onTimePct)])}
    />
  );
}

function TransporterTable({ d, onDrill }: { d: DashboardResponse; onDrill: (x: Drill) => void }) {
  return (
    <Card aria-label="Transporter performance">
      <CardHeader title="Transporter performance: raw vs fair on-time" titleAs="h2" />
      <p className="px-4 pt-1 text-small text-text-muted">{d.definitions.fairOnTime} Gap = fair − raw. Select a transporter to list its shipments.</p>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[760px] text-left text-body">
          <caption className="sr-only">Transporter performance</caption>
          <thead className="text-small text-text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Transporter</th>
              <th className="py-1 pr-3 text-right font-medium">Fleet</th>
              <th className="py-1 pr-3 text-right font-medium">Arrived</th>
              <th className="py-1 pr-3 text-right font-medium">Raw on-time</th>
              <th className="py-1 pr-3 text-right font-medium">Fair on-time</th>
              <th className="py-1 pr-3 text-right font-medium">Gap</th>
              <th className="py-1 pr-3 text-right font-medium">Median delay (late)</th>
              <th className="py-1 font-medium">Top attributed cause</th>
            </tr>
          </thead>
          <tbody>
            {d.transporterTable.map((x) => (
              <tr key={x.transporterId} className="border-t border-border">
                <td className="py-2 pr-3">
                  <button type="button" className="link" onClick={() => onDrill({ title: x.name, transporterId: x.transporterId })}>
                    {x.name}
                  </button>
                  {x.isSmall ? (
                    <Tooltip content="Fleet of 10 trucks or fewer. Fair on-time does not hold delays caused by plant gate waits, weather or other parties against the transporter.">
                      <span className="ml-2 inline-flex">
                        <Badge tone="accent">Small fleet</Badge>
                      </span>
                    </Tooltip>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-right tabular">{x.fleetSize}</td>
                <td className="py-2 pr-3 text-right tabular">{formatInt(x.delivered)}</td>
                <td className="py-2 pr-3 text-right tabular">{formatPct(x.rawOnTimePct)}</td>
                <td className="py-2 pr-3 text-right tabular">{formatPct(x.fairOnTimePct)}</td>
                <td className={x.gapPct ? 'bg-primary-subtle py-2 pr-3 text-right font-medium text-primary tabular' : 'py-2 pr-3 text-right tabular'}>
                  {x.gapPct === null ? '—' : `+${x.gapPct.toFixed(1)} pts`}
                </td>
                <td className="py-2 pr-3 text-right tabular">{x.medianDelayMinutesOfLate === null ? '—' : formatDuration(x.medianDelayMinutesOfLate)}</td>
                <td className="py-2">
                  {x.topCause ? (
                    <span className="inline-flex items-center gap-2">
                      <PartyChip party={x.topCause.party} />
                      <span className="text-text-secondary">{x.topCause.reason ? reasonLabel[x.topCause.reason] : 'Unexplained'}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Drill-down (UI plan §13.1): the same arrival window and filters through #14 (status=all, arrival-based). */
function DrillDown({ drill, d, onClose }: { drill: NonNullable<Drill>; d: DashboardResponse; onClose: () => void }) {
  const laneId = drill.laneId ?? d.filter.laneId ?? undefined;
  const transporterId = drill.transporterId ?? d.filter.transporterId ?? undefined;
  const list = useShipments({
    status: 'all',
    arrivedFrom: d.filter.from,
    arrivedTo: d.filter.to,
    sort: 'promise',
    limit: 200,
    ...(laneId ? { laneId } : {}),
    ...(transporterId ? { transporterId } : {}),
  });
  const items = (list.data?.items ?? []).filter((s): s is ShipmentListItemCoordinator => s.view === 'coordinator');
  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())} title={`${drill.title} · arrived shipments`} description={`${formatDayTime(d.filter.from)} – ${formatDayTime(d.filter.to)}`} width="lg">
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <ErrorState compact title="Couldn't load the shipments" error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="No shipments" />
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-body">
            <caption className="sr-only">Arrived shipments</caption>
            <thead className="sticky top-0 bg-surface text-small text-text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Shipment</th>
                <th className="py-1 pr-3 font-medium">Customer</th>
                <th className="py-1 pr-3 font-medium">Arrived</th>
                <th className="py-1 pr-3 font-medium">Promised by</th>
                <th className="py-1 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-1 pr-3">
                    <Link to={`/shipments/${encodeURIComponent(s.id)}`} className="text-primary code-label hover:underline">
                      {s.code}
                    </Link>
                  </td>
                  <td className="py-1 pr-3">{s.customer.name}</td>
                  <td className="py-1 pr-3 tabular">{s.arrivedAt ? formatDayTime(s.arrivedAt) : '—'}</td>
                  <td className="py-1 pr-3 tabular">{formatDayTime(s.promisedBy)}</td>
                  <td className="py-1">{s.onTime ? 'On time' : `Late by ${formatDuration(s.delayMinutes ?? 0)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 200 ? <p className="mt-2 text-small text-text-muted">Showing the first 200.</p> : null}
        </div>
      )}
    </Dialog>
  );
}
