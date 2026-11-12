import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PARTIES, type DashboardResponse, type Party } from '../../api/contract';
import { Card, CardHeader } from '../../components/display/basics';
import { cssToken } from '../../components/cssToken';
import { SegmentedControl } from '../../components/primitives/radix';
import { partyLabel, reasonLabel } from '../../i18n/en';
import { formatInt } from '../../i18n/format';
import { PartyLegend } from './PartyLegend';

/**
 * Dashboard chart cards (UI plan §13.1): title, one-line definition, Chart / Table toggle, hover
 * tooltips, value labels on bars, one y axis per chart, fixed party order and a legend. Every value
 * is the API's (#36); nothing is computed here except the display date of a week.
 */

const PARTY_TOKEN: Record<Party, `--rp-${string}`> = {
  PLANT: '--rp-party-plant',
  TRANSPORTER: '--rp-party-transporter',
  CUSTOMER: '--rp-party-customer',
  EXTERNAL: '--rp-party-external',
  UNATTRIBUTED: '--rp-party-unattributed',
};
const tick = () => ({ fill: cssToken('--rp-text-muted'), fontSize: 12 });
const pctLabel = (v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—');

const weekFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
export const weekLabel = (iso: string) => `Wk of ${weekFmt.format(new Date(iso))}`;

export function ChartCard({
  title,
  definition,
  chart,
  table,
  label,
  footer,
}: {
  title: string;
  definition?: string;
  chart: ReactNode;
  table: ReactNode;
  label: string;
  footer?: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card aria-label={label} className="min-w-0">
      <CardHeader
        title={title}
        titleAs="h2"
        actions={
          <SegmentedControl<'chart' | 'table'>
            size="sm"
            label={`${title}: chart or table`}
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        }
      />
      {definition ? <p className="px-4 pt-1 text-small text-text-muted">{definition}</p> : null}
      <div className="p-4">{view === 'chart' ? chart : <div className="max-h-80 overflow-auto">{table}</div>}</div>
      {footer ? <div className="px-4 pb-4">{footer}</div> : null}
    </Card>
  );
}

export function SimpleTable({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption: string }) {
  return (
    <table className="w-full text-left text-body">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-surface text-small text-text-muted">
        <tr>
          {head.map((h, i) => (
            <th key={h} className={i === 0 ? 'py-1 pr-3 font-medium' : 'py-1 pr-3 text-right font-medium'}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {r.map((c, j) => (
              <td key={j} className={j === 0 ? 'py-1 pr-3' : 'py-1 pr-3 text-right tabular'}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Horizontal bars of on-time % (0–100) with value labels. */
export function OnTimeBars({ data, ariaLabel }: { data: { name: string; onTimePct: number | null; delivered: number }[]; ariaLabel: string }) {
  const height = Math.max(120, data.length * 36 + 32);
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} stroke={cssToken('--rp-border')} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={tick()} stroke={cssToken('--rp-border')} />
          <YAxis type="category" dataKey="name" width={130} tick={tick()} stroke={cssToken('--rp-border')} />
          <Tooltip formatter={(v, _n, p) => [`${pctLabel(v)} of ${(p.payload as { delivered: number }).delivered} arrived`, 'On time']} />
          <Bar dataKey="onTimePct" fill={cssToken('--rp-chart-1')} isAnimationActive={false} barSize={18} radius={[0, 3, 3, 0]}>
            <LabelList dataKey="onTimePct" position="right" formatter={pctLabel} fill={cssToken('--rp-text')} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyOnTimeChart({ weeks }: { weeks: DashboardResponse['weeklyTrend'] }) {
  const data = weeks.map((w) => ({ name: weekLabel(w.weekStart), onTimePct: w.onTimePct, delivered: w.delivered }));
  return (
    <div className="h-56" role="img" aria-label="On-time percentage per week">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={cssToken('--rp-border')} />
          <XAxis dataKey="name" tick={tick()} stroke={cssToken('--rp-border')} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={tick()} stroke={cssToken('--rp-border')} width={44} />
          <Tooltip formatter={(v, _n, p) => [`${pctLabel(v)} of ${(p.payload as { delivered: number }).delivered} arrived`, 'On time']} />
          <Line dataKey="onTimePct" stroke={cssToken('--rp-chart-1-strong')} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyVolumeChart({ weeks }: { weeks: DashboardResponse['weeklyTrend'] }) {
  const data = weeks.map((w) => ({ name: weekLabel(w.weekStart), delivered: w.delivered }));
  return (
    <div className="h-56" role="img" aria-label="Shipments arrived per week">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={cssToken('--rp-border')} />
          <XAxis dataKey="name" tick={tick()} stroke={cssToken('--rp-border')} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={tick()} stroke={cssToken('--rp-border')} width={36} />
          <Tooltip formatter={(v) => [formatInt(Number(v)), 'Arrived']} />
          <Bar dataKey="delivered" fill={cssToken('--rp-chart-1')} isAnimationActive={false} barSize={22} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="delivered" position="top" fill={cssToken('--rp-text')} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 100 % stacked bars of delay minutes by party, one bar per lane or transporter (fixed party order). */
export function PartyShareBars({ rows, ariaLabel }: { rows: { name: string; byParty: { party: Party; minutes: number }[] }[]; ariaLabel: string }) {
  const data = rows.map((r) => ({ name: r.name, ...Object.fromEntries(r.byParty.map((p) => [p.party, p.minutes])) }));
  const height = Math.max(120, data.length * 36 + 32);
  return (
    <div>
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
            <XAxis type="number" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={tick()} stroke={cssToken('--rp-border')} />
            <YAxis type="category" dataKey="name" width={130} tick={tick()} stroke={cssToken('--rp-border')} />
            <Tooltip formatter={(v, n) => [`${formatInt(Number(v))} min`, partyLabel[n as Party]]} />
            {PARTIES.map((p) => (
              <Bar key={p} dataKey={p} stackId="parties" fill={cssToken(PARTY_TOKEN[p])} isAnimationActive={false} barSize={18} stroke={cssToken('--rp-surface')} strokeWidth={1} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <PartyLegend className="mt-2" />
    </div>
  );
}

/** Delay minutes by reason, sorted (as returned), bar colour = attributed party. */
export function ReasonBars({ rows }: { rows: DashboardResponse['causesByReason'] }) {
  const data = rows.map((r) => ({ name: `${reasonLabel[r.reason]} · ${partyLabel[r.party]}`, minutes: r.minutes, party: r.party }));
  const height = Math.max(120, data.length * 32 + 32);
  return (
    <div>
      <div style={{ height }} role="img" aria-label="Delay minutes by reason">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={cssToken('--rp-border')} />
            <XAxis type="number" allowDecimals={false} tick={tick()} stroke={cssToken('--rp-border')} />
            <YAxis type="category" dataKey="name" width={220} tick={tick()} stroke={cssToken('--rp-border')} />
            <Tooltip formatter={(v) => [`${formatInt(Number(v))} min`, 'Delay']} />
            <Bar dataKey="minutes" isAnimationActive={false} barSize={16} radius={[0, 3, 3, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={cssToken(PARTY_TOKEN[d.party])} />
              ))}
              <LabelList dataKey="minutes" position="right" formatter={(v: unknown) => `${formatInt(Number(v))} min`} fill={cssToken('--rp-text')} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <PartyLegend className="mt-2" />
    </div>
  );
}

