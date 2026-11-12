import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReplayResponse } from '../../api/contract';
import { cssToken } from '../../components/cssToken';
import { riskLabel } from '../../i18n/en';
import { formatDayTime, formatTime, formatTimeRelative } from '../../i18n/format';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Times are shown in IST (UTC+5:30, no daylight saving) — ticks fall on whole IST hours. */
const IST_OFFSET_MS = 330 * MIN;

/** Whole-hour IST y ticks (about five) so labels read "18:00", "Fri 06:00" — never odd minutes. */
export function hourTicks(yMin: number, yMax: number): number[] {
  const stepH = Math.max(1, Math.ceil((yMax - yMin) / HOUR / 5));
  const ticks: number[] = [];
  const first = Math.ceil((yMin + IST_OFFSET_MS) / HOUR) * HOUR - IST_OFFSET_MS;
  for (let t = first; t <= yMax; t += stepH * HOUR) ticks.push(t);
  return ticks;
}

interface Row {
  t: number;
  eta: number;
  band: [number, number];
  label: string;
}

/** Rows for the chart, straight from the stored snapshots (no values are computed here). */
export function chartRows(r: ReplayResponse): Row[] {
  return r.snapshots.map((s) => ({
    t: Date.parse(s.simTime),
    eta: Date.parse(s.predictedArrivalAt),
    band: [Date.parse(s.etaLowAt), Date.parse(s.etaHighAt)],
    label: `${formatTime(s.simTime)} · ${riskLabel[s.level]}`,
  }));
}

/**
 * EtaTimelineChart (UI plan §10.1): x = simulation time, y = time of day. Predicted ETA line with the
 * rule-based range band, dashed promised-by line, the first-at-risk diamond and the selected moment.
 * One y axis only. A table view of the same rows sits next to it on the page.
 */
export function EtaTimelineChart({ replay, selectedTime }: { replay: ReplayResponse; selectedTime: string | null }) {
  const rows = chartRows(replay);
  const promise = Date.parse(replay.promisedBy);
  const lows = rows.map((r) => r.band[0]);
  const highs = rows.map((r) => r.band[1]);
  const yMin = Math.min(promise, ...lows) - 30 * MIN;
  const yMax = Math.max(promise, ...highs) + 30 * MIN;
  const dayRef = replay.snapshots[0]?.simTime ?? replay.promisedBy;
  const first = replay.firstAtRiskAt ? rows.find((r) => r.t === Date.parse(replay.firstAtRiskAt as string)) ?? null : null;
  const primary = cssToken('--rp-primary');
  const navy = cssToken('--rp-ink-900');
  const danger = cssToken('--rp-danger');
  const muted = cssToken('--rp-text-muted');
  const grid = cssToken('--rp-border');

  return (
    <div className="h-[220px] w-full" role="img" aria-label="Estimated arrival over time, with the promised time as a dashed line">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatTime(new Date(v).toISOString())}
            stroke={grid}
            tick={{ fill: muted, fontSize: 12 }}
          />
          <YAxis
            type="number"
            domain={[yMin, yMax]}
            ticks={hourTicks(yMin, yMax)}
            tickFormatter={(v: number) => formatTimeRelative(new Date(v).toISOString(), dayRef)}
            stroke={grid}
            tick={{ fill: muted, fontSize: 12 }}
            width={72}
          />
          <Tooltip
            labelFormatter={(v) => `At ${formatTime(new Date(Number(v)).toISOString())}`}
            formatter={(value, name) => {
              if (Array.isArray(value)) return [`${formatTime(new Date(Number(value[0])).toISOString())}–${formatTime(new Date(Number(value[1])).toISOString())}`, 'Range'];
              return [formatDayTime(new Date(Number(value)).toISOString()), name === 'eta' ? 'Estimated arrival' : String(name)];
            }}
          />
          <Area dataKey="band" stroke="none" fill={primary} fillOpacity={0.12} isAnimationActive={false} name="Range" />
          <Line dataKey="eta" stroke={primary} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} name="eta" />
          <ReferenceLine y={promise} stroke={navy} strokeDasharray="6 4" label={{ value: 'Promised by', position: 'insideTopRight', fill: navy, fontSize: 12 }} />
          {selectedTime ? <ReferenceLine x={Date.parse(selectedTime)} stroke={muted} /> : null}
          {first ? <ReferenceDot x={first.t} y={first.eta} r={7} fill={danger} stroke={danger} shape={Diamond} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Diamond(props: { cx?: number; cy?: number; fill?: string }) {
  const { cx = 0, cy = 0, fill } = props;
  return <path d={`M${cx} ${cy - 7} L${cx + 7} ${cy} L${cx} ${cy + 7} L${cx - 7} ${cy} Z`} fill={fill} />;
}
