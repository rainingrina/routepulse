import { useState } from 'react';
import { Dialog } from '../../components/primitives/radix';
import { Button } from '../../components/primitives/Button';
import { RecoveryPanel } from './RecoveryPanel';
import { RECOVERY_AVAILABLE, RECOVERY_UNAVAILABLE_TEXT } from './availability';

/** Quick panel recovery block (UI plan §6.5 item 5): Suggested card + "Compare all options" modal. */
export function RecoveryQuickSection({ shipmentId, startOpen = false }: { shipmentId: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  if (!RECOVERY_AVAILABLE) {
    return (
      <section aria-labelledby="qp-recovery" className="flex flex-col gap-2">
        <h3 id="qp-recovery" className="overline text-text-muted">
          Recovery
        </h3>
        <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-small text-text-secondary">{RECOVERY_UNAVAILABLE_TEXT}</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="qp-recovery" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 id="qp-recovery" className="overline text-text-muted">
          Recovery
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Compare all options
        </Button>
      </div>
      <RecoveryPanel shipmentId={shipmentId} onlySuggested />
      <Dialog open={open} onOpenChange={setOpen} title="Recovery options" width="lg" description="Rule-based options. Feasibility, ETAs and costs come from RoutePulse; costs use a fictional rate card.">
        <RecoveryPanel shipmentId={shipmentId} />
      </Dialog>
    </section>
  );
}
