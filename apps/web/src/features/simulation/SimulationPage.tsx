import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { CreateDisruptionRequest, CreateDisruptionResponse, DisruptionKind, ShipmentListItemCoordinator } from '../../api/contract';
import { isApiRequestError } from '../../api/client';
import { useCreateDisruption, useDisruptions, useEndDisruption, useReference, useShipments } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { Card, CardHeader, EmptyState, Skeleton } from '../../components/display/basics';
import { Banner, ErrorState, InlineError } from '../../components/display/feedback';
import { Button } from '../../components/primitives/Button';
import { SegmentedControl } from '../../components/primitives/radix';
import { TextField } from '../../components/primitives/TextField';
import { CloudRain, ICON_STROKE } from '../../components/icons';
import { riskLabel, t } from '../../i18n/en';
import { formatDayTime } from '../../i18n/format';
import { selectClass } from '../../components/primitives/fieldStyles';

const KIND_LABEL: Record<DisruptionKind, string> = {
  WEATHER_SLOWDOWN: 'Heavy rain',
  ROAD_CLOSURE: 'Road closure',
  GATE_CONGESTION: 'Gate congestion',
  TRUCK_BREAKDOWN: 'Truck breakdown',
};

const LIVE_QUERY = { status: 'live', sort: 'risk' } as const;

/**
 * Simulation page (UI plan §14, spec §5.7): inject a disruption (#8), see its impact, end it (#9).
 * The server applies it through the simulation engine and the recalculation pipeline; this page only
 * shows what the API returns. Coordinator + DEMO_MODE (server-enforced).
 */
export default function SimulationPage() {
  const { sync } = useSync();
  const [result, setResult] = useState<CreateDisruptionResponse | null>(null);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-h1 text-text">Simulation</h1>
        <p className="text-body text-text-secondary">
          Inject a fictional disruption at the current simulation time{sync ? ` (${formatDayTime(sync.simTime)})` : ''}. Affected shipments are recalculated by the rule-based engine.
        </p>
      </header>
      {sync && !sync.demoMode ? <Banner tone="warning">{t.sim.demoOff}</Banner> : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <Card aria-label="Inject a disruption">
          <CardHeader title="Inject a disruption" />
          <div className="p-4">
            <DisruptionForm disabled={!sync?.demoMode} onDone={setResult} />
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          {result ? <ImpactCard r={result} /> : null}
          <ActiveDisruptions onEnded={setResult} disabled={!sync?.demoMode} />
        </div>
      </div>
    </div>
  );
}

function DisruptionForm({ disabled, onDone }: { disabled: boolean; onDone: (r: CreateDisruptionResponse) => void }) {
  const reference = useReference();
  const shipments = useShipments(LIVE_QUERY);
  const create = useCreateDisruption();
  const [kind, setKind] = useState<DisruptionKind>('WEATHER_SLOWDOWN');
  const [segments, setSegments] = useState<string[]>([]);
  const [slowdown, setSlowdown] = useState('50');
  const [duration, setDuration] = useState('240');
  const [extra, setExtra] = useState('30');
  const [shipmentId, setShipmentId] = useState('');
  const [repair, setRepair] = useState('180');
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  if (reference.isPending) return <Skeleton className="h-64" />;
  if (reference.isError) return <ErrorState compact title="Couldn't load segments" error={reference.error} onRetry={() => void reference.refetch()} />;
  const moving = ((shipments.data?.items ?? []) as ShipmentListItemCoordinator[]).filter((s) => s.currentMilestone === 'IN_TRANSIT' && !s.arrivedAt);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const l = label.trim() ? { label: label.trim() } : {};
    let body: CreateDisruptionRequest;
    if (kind === 'WEATHER_SLOWDOWN' || kind === 'ROAD_CLOSURE') {
      if (segments.length === 0) return setProblem('Pick at least one road segment.');
      body = kind === 'WEATHER_SLOWDOWN' ? { kind, ...l, segmentCodes: segments, slowdownPct: Number(slowdown), durationMinutes: Number(duration) } : { kind, ...l, segmentCodes: segments, durationMinutes: Number(duration) };
    } else if (kind === 'GATE_CONGESTION') {
      body = { kind, ...l, extraMinutesPerTruck: Number(extra), durationMinutes: Number(duration) };
    } else {
      if (!shipmentId) return setProblem('Pick a shipment on the road.');
      body = { kind, ...l, shipmentId, repairMinutes: Number(repair) };
    }
    create.mutate(body, { onSuccess: onDone });
  };
  const validation = isApiRequestError(create.error) ? create.error.validationIssues : [];
  const fieldError = (f: string) => validation.find((i) => i.path === f)?.message ?? null;

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <SegmentedControl<DisruptionKind>
        label="Type"
        value={kind}
        onChange={(v) => setKind(v)}
        options={(Object.keys(KIND_LABEL) as DisruptionKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
      />
      {kind === 'WEATHER_SLOWDOWN' || kind === 'ROAD_CLOSURE' ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-small text-text-secondary">Road segments (shared segments affect every route that uses them)</legend>
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-border p-2 xl:grid-cols-2">
            {reference.data.segments.map((sg) => (
              <label key={sg.segmentCode} className="flex min-h-9 items-center gap-2 text-body text-text">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={segments.includes(sg.segmentCode)}
                  onChange={(e) => setSegments((cur) => (e.target.checked ? [...cur, sg.segmentCode] : cur.filter((c) => c !== sg.segmentCode)))}
                />
                <span className="min-w-0 truncate">
                  {sg.name} <span className="text-small text-text-muted code-label">{sg.segmentCode}</span>
                </span>
              </label>
            ))}
          </div>
          {fieldError('segmentCodes') ? <p className="text-small text-danger">{fieldError('segmentCodes')}</p> : null}
        </fieldset>
      ) : null}
      {kind === 'WEATHER_SLOWDOWN' ? <TextField label="Slowdown %" type="number" min={10} max={90} value={slowdown} onChange={(e) => setSlowdown(e.target.value)} hint="10–90" error={fieldError('slowdownPct')} /> : null}
      {kind === 'GATE_CONGESTION' ? <TextField label="Extra loading minutes per truck" type="number" min={5} max={240} value={extra} onChange={(e) => setExtra(e.target.value)} hint="5–240" error={fieldError('extraMinutesPerTruck')} /> : null}
      {kind !== 'TRUCK_BREAKDOWN' ? <TextField label="Duration (minutes)" type="number" min={15} max={1440} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} hint="15–1440, multiple of 5" error={fieldError('durationMinutes')} /> : null}
      {kind === 'TRUCK_BREAKDOWN' ? (
        <>
          <label className="flex flex-col gap-1.5 text-small text-text-secondary">
            Shipment on the road
            <select className={selectClass} value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
              <option value="">Choose…</option>
              {moving.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.customer.name} · {s.truckCode ?? 'no truck'}
                </option>
              ))}
            </select>
          </label>
          <TextField label="Repair time (minutes)" type="number" min={15} max={720} value={repair} onChange={(e) => setRepair(e.target.value)} hint="15–720" error={fieldError('repairMinutes')} />
        </>
      ) : null}
      <TextField label="Label (optional)" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} hint="Shown on the map and in alerts; a label is generated if empty" />
      {problem ? <p className="text-small text-danger" role="alert">{problem}</p> : null}
      <InlineError error={validation.length > 0 ? null : create.error} />
      <Button type="submit" variant="primary" icon={CloudRain} loading={create.isPending} disabled={disabled}>
        Inject disruption
      </Button>
    </form>
  );
}

function ImpactCard({ r }: { r: CreateDisruptionResponse }) {
  return (
    <Card aria-label="Impact">
      <CardHeader title={r.disruption.label} eyebrow={r.disruption.endedEarlyAt ? 'Ended' : 'Injected'} />
      <div className="flex flex-col gap-2 p-4">
        <p className="text-body font-semibold text-text" role="status">
          {r.impact.summary}
        </p>
        {r.impact.levelChanges.length > 0 ? (
          <ul className="flex flex-col gap-1 text-body">
            {r.impact.levelChanges.map((c) => (
              <li key={c.shipmentId}>
                <Link to={`/shipments/${encodeURIComponent(c.shipmentId)}`} className="code-label link">
                  {c.code}
                </Link>{' '}
                {c.from ? riskLabel[c.from] : '—'} → {c.to ? riskLabel[c.to] : '—'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-text-muted">No risk level changed.</p>
        )}
        <Link to="/control-tower" className="self-start text-body link">
          See it on the control tower
        </Link>
      </div>
    </Card>
  );
}

function ActiveDisruptions({ onEnded, disabled }: { onEnded: (r: CreateDisruptionResponse) => void; disabled: boolean }) {
  const list = useDisruptions({ active: 'true' });
  const end = useEndDisruption();
  return (
    <Card aria-label="Active disruptions">
      <CardHeader title="Active disruptions" />
      <div className="p-4">
        {list.isPending ? (
          <Skeleton className="h-20" />
        ) : list.isError ? (
          <ErrorState compact title="Couldn't load disruptions" error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={CloudRain} title="No active disruptions" className="py-6" />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.data.items.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-2">
                <div className="min-w-0">
                  <p className="text-body font-medium text-text">
                    <CloudRain aria-hidden className="mr-1 inline size-4 text-accent" strokeWidth={ICON_STROKE} />
                    {d.label}
                  </p>
                  <p className="text-small text-text-muted">
                    {KIND_LABEL[d.kind]} · until {formatDayTime(d.endsAt)}
                    {d.segmentCodes.length > 0 ? ` · ${d.segmentCodes.join(', ')}` : ''}
                  </p>
                </div>
                <Button size="sm" disabled={disabled || end.isPending} onClick={() => end.mutate(d.id, { onSuccess: onEnded })}>
                  End now
                </Button>
              </li>
            ))}
          </ul>
        )}
        <InlineError error={end.error} className="mt-2" />
      </div>
    </Card>
  );
}
