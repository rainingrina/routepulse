import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  DRIVER_REASON_CODES,
  REPORT_ESTIMATE_MINUTES,
  type CreateDriverReportRequest,
  type DriverReasonCode,
  type ReasonCode,
} from '../../api/contract';
import { useClassify, useCreateDriverReport, useTrip } from '../../api/hooks/portal';
import { Card, EmptyState, Skeleton } from '../../components/display/basics';
import { Banner, ErrorState, InlineError } from '../../components/display/feedback';
import { ArrowLeft, CircleCheck, ICON_STROKE, Send, Truck } from '../../components/icons';
import { Button } from '../../components/primitives/Button';
import { cn } from '../../components/cn';
import { driverChipLabel } from '../../i18n/en';
import { formatDuration, formatTime } from '../../i18n/format';

const CLASSIFY_DEBOUNCE_MS = 400;
const MAX_TEXT = 280;
type Estimate = (typeof REPORT_ESTIMATE_MINUTES)[number];

const isDriverReason = (r: ReasonCode | null): r is DriverReasonCode => r !== null && (DRIVER_REASON_CODES as readonly string[]).includes(r);

/**
 * Report a problem (UI plan §12.2; #22, #23). Fast path: chip → Send. Typed text is classified by
 * the server's keyword list (#22, debounced 400 ms) and nothing is sent until the driver confirms
 * the suggested reason or picks a chip (AC-F2.2).
 */
export default function ReportProblemPage() {
  const [params] = useSearchParams();
  const trip = useTrip();
  if (trip.isPending) return <Skeleton className="h-64" />;
  if (trip.isError) return <ErrorState title="Couldn't load your trip" error={trip.error} onRetry={() => void trip.refetch()} />;
  const wanted = params.get('shipment');
  const s = trip.data.items.find((x) => x.id === wanted) ?? trip.data.items[0] ?? null;
  if (!s) {
    return (
      <Card>
        <EmptyState icon={Truck} title="No trip assigned right now." action={<BackToTrip />} />
      </Card>
    );
  }
  return <ReportForm shipmentId={s.id} shipmentCode={s.code} />;
}

function BackToTrip() {
  return (
    <Link to="/trip" className="inline-flex min-h-12 items-center gap-1 text-body-lg text-primary hover:underline">
      <ArrowLeft aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      Back to trip
    </Link>
  );
}

function ReportForm({ shipmentId, shipmentCode }: { shipmentId: string; shipmentCode: string }) {
  const [chip, setChip] = useState<DriverReasonCode | null>(null);
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState<DriverReasonCode | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const classify = useClassify();
  const create = useCreateDriverReport(shipmentId);
  const trimmed = text.trim();

  // #22 debounced; a new text clears an earlier confirmation of a suggestion.
  const { mutate: runClassify, reset: resetClassify } = classify;
  useEffect(() => {
    setConfirmed(null);
    setDismissed(false);
    if (trimmed.length === 0) {
      resetClassify();
      return;
    }
    const timer = setTimeout(() => runClassify({ text: trimmed }), CLASSIFY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, runClassify, resetClassify]);

  const suggestion = classify.data && classify.variables?.text === trimmed ? classify.data : null;
  const suggested = suggestion && isDriverReason(suggestion.suggestedReason) ? suggestion.suggestedReason : null;
  const reason: DriverReasonCode | null = chip ?? confirmed;
  const canSend = reason !== null && (chip !== null || trimmed.length > 0) && !create.isPending;

  if (create.isSuccess) {
    const r = create.data.report;
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="success" live>
          <span className="text-body-lg font-semibold">Plant X has been informed.</span>
        </Banner>
        <Card>
          <div className="flex flex-col gap-1 p-4">
            <p className="text-body-lg text-text">
              <CircleCheck aria-hidden className="mr-1 inline size-5 text-success" strokeWidth={2} />
              {driverChipLabel[isDriverReason(r.reason) ? r.reason : 'OTHER']} · {shipmentCode}
            </p>
            <p className="text-body text-text-secondary">
              Sent {formatTime(r.simTime)}
              {r.estimatedMinutes ? ` · about ${formatDuration(r.estimatedMinutes)}` : ''} · waiting for Plant X to review
            </p>
          </div>
        </Card>
        <BackToTrip />
      </div>
    );
  }

  const submit = () => {
    if (!reason) return;
    const body: CreateDriverReportRequest = {
      reason,
      ...(chip ? { chipReason: chip } : {}),
      ...(trimmed ? { text: trimmed } : {}),
      ...(estimate ? { estimatedMinutes: estimate } : {}),
    };
    create.mutate(body);
  };

  return (
    <div className="flex flex-col gap-5 pb-24">
      <BackToTrip />
      <h1 className="text-h1 text-text">Report a problem</h1>
      <p className="-mt-3 text-body text-text-secondary">Shipment {shipmentCode}</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-h3 text-text">What happened?</legend>
        <div className="grid grid-cols-2 gap-2">
          {DRIVER_REASON_CODES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={chip === r}
              onClick={() => setChip(chip === r ? null : r)}
              className={cn(
                'min-h-16 rounded-md border px-3 text-left text-body-lg font-medium',
                chip === r ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong bg-surface text-text',
              )}
            >
              {driverChipLabel[r]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="report-text" className="text-h3 text-text">
          Or describe it
        </label>
        <textarea
          id="report-text"
          value={text}
          maxLength={MAX_TEXT}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          className="rounded-md border border-border-strong bg-surface p-3 text-body-lg text-text focus-visible:outline-2 focus-visible:outline-primary"
          aria-describedby="report-text-count"
        />
        <span id="report-text-count" className="self-end text-small text-text-muted tabular">
          {text.length}/{MAX_TEXT}
        </span>
        {trimmed && chip === null ? (
          <div aria-live="polite">
            {classify.isPending ? (
              <p className="text-body text-text-muted">Checking…</p>
            ) : suggested && !dismissed ? (
              confirmed ? (
                <p className="text-body text-text">
                  Reason: <strong>{driverChipLabel[confirmed]}</strong>
                </p>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-subtle p-3">
                  <p className="text-body text-text">
                    Suggested: <strong>{driverChipLabel[suggested]}</strong>
                    {suggestion && suggestion.matchedKeywords.length > 0 ? ` — matched: ${suggestion.matchedKeywords.join(', ')}` : ''}. Is this right?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="touch" variant="primary" onClick={() => setConfirmed(suggested)}>
                      Yes
                    </Button>
                    <Button size="touch" onClick={() => setDismissed(true)}>
                      Pick another
                    </Button>
                  </div>
                </div>
              )
            ) : suggestion ? (
              <p className="text-body text-text-secondary">Pick the reason above that fits best.</p>
            ) : null}
            <InlineError error={classify.error} />
          </div>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-h3 text-text">How long? (optional)</legend>
        <div className="grid grid-cols-4 gap-2">
          {REPORT_ESTIMATE_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={estimate === m}
              onClick={() => setEstimate(estimate === m ? null : m)}
              className={cn(
                'min-h-12 rounded-md border text-body font-medium',
                estimate === m ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong bg-surface text-text',
              )}
            >
              {m === 240 ? '4 h+' : formatDuration(m)}
            </button>
          ))}
        </div>
      </fieldset>

      <InlineError error={create.error} />
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-[480px]">
          <Button variant="primary" size="touch" fullWidth className="min-h-14" icon={Send} disabled={!canSend} loading={create.isPending} onClick={submit}>
            Send report
          </Button>
          {!reason ? <p className="mt-1 text-center text-small text-text-muted">Pick a reason, or confirm the suggestion, to send.</p> : null}
        </div>
      </div>
    </div>
  );
}
