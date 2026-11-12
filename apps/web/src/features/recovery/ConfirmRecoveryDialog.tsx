import { useState } from 'react';
import type { RecoveryOptionDto } from '../../api/contract';
import { Banner, InlineError } from '../../components/display/feedback';
import { Button } from '../../components/primitives/Button';
import { Dialog } from '../../components/primitives/radix';
import { formatInr, formatTimeRelative, rangeHalfWidthMinutes } from '../../i18n/format';
import { recoveryKindLabel } from '../../i18n/en';

const NOTE_MAX = 280;

/**
 * UI plan §9.2 ConfirmRecoveryDialog / NewWindowDialog. NEW_WINDOW shows the option's fixed
 * `newWindowEnd` read-only — no time picker — so preview and execution use the same window (L4).
 * The customer message line is a PREVIEW of the server template, not the sent text.
 */
export function ConfirmRecoveryDialog({
  option,
  simTime,
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
}: {
  option: RecoveryOptionDto | null;
  simTime: string | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (note: string) => void;
  pending: boolean;
  error: unknown;
}) {
  const [note, setNote] = useState('');
  if (!option) return null;
  const isWindow = option.kind === 'NEW_WINDOW';
  const half = option.newEtaAt && option.etaLowAt && option.etaHighAt ? rangeHalfWidthMinutes(option.newEtaAt, option.etaLowAt, option.etaHighAt) : null;
  const etaText = option.newEtaAt ? formatTimeRelative(option.newEtaAt, simTime) : '—';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setNote('');
        onOpenChange(o);
      }}
      title={isWindow ? 'Propose a new receiving window' : `Confirm: ${option.title}`}
      description={isWindow ? 'This window applies to this shipment only. The customer’s normal receiving hours do not change.' : 'This applies the action now and notifies the customer.'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={() => onConfirm(note.trim())}>
            {isWindow ? 'Send to customer' : 'Confirm'}
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-3 rounded-md border border-border bg-surface-subtle p-3 text-body">
        <div>
          <dt className="text-small text-text-muted">Action</dt>
          <dd className="font-medium text-text">{recoveryKindLabel[option.kind]}</dd>
        </div>
        <div>
          <dt className="text-small text-text-muted">New estimated arrival</dt>
          <dd className="font-medium text-text tabular">
            {etaText}
            {half ? ` ± ${half} min` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-small text-text-muted">Extra cost</dt>
          <dd className="font-medium text-text tabular">{formatInr(option.extraCostInr)}</dd>
        </div>
        {isWindow && option.newWindowEnd ? (
          <div>
            <dt className="text-small text-text-muted">Agreed window for this shipment</dt>
            <dd className="font-medium text-text tabular">until {formatTimeRelative(option.newWindowEnd, simTime)}</dd>
          </div>
        ) : null}
      </dl>
      {isWindow ? (
        <Banner tone="info" className="mt-3">
          The customer must accept. Until then the promise does not change.
        </Banner>
      ) : (
        <p className="mt-3 text-small text-text-secondary">
          <span className="font-medium text-text">Customer message preview:</span> “Plant X confirmed: {recoveryKindLabel[option.kind].toLowerCase()}. New estimate {etaText}
          {half ? ` ± ${half} min` : ''}.”
        </p>
      )}
      <p className="mt-2 text-small text-text-muted">
        The estimate is recalculated at the simulation minute you confirm; the confirmed result is shown after you choose.
      </p>
      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-small text-text-secondary">Note (optional)</span>
        <textarea
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="rounded-sm border border-border-input bg-surface px-3 py-2 text-body"
        />
        <span className="self-end text-small text-text-muted tabular">
          {note.length}/{NOTE_MAX}
        </span>
      </label>
      <InlineError error={error} className="mt-2" />
    </Dialog>
  );
}
