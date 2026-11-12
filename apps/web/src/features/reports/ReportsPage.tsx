import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PARTIES, REASON_CODES, type DriverReportDto, type Party, type ReasonCode, type ReportStatus } from '../../api/contract';
import { useReviewDriverReport } from '../../api/hooks/portal';
import { useDriverReports } from '../../api/hooks/world';
import { Badge, Card, EmptyState, PartyChip, Skeleton } from '../../components/display/basics';
import { ErrorState, InlineError } from '../../components/display/feedback';
import { Inbox } from '../../components/icons';
import { Button } from '../../components/primitives/Button';
import { Dialog, TabsContent, TabsList, TabsRoot, TabsTrigger } from '../../components/primitives/radix';
import { partyLabel, reasonLabel } from '../../i18n/en';
import { formatDayTime, formatDuration } from '../../i18n/format';

const NOTE_MIN = 5;
const NOTE_MAX = 280;

/** Splits text into plain and matched-keyword parts (case-insensitive) for highlighting (UI plan §7.6). */
export function highlightParts(text: string, keywords: readonly string[]): { text: string; match: boolean }[] {
  const words = keywords.filter((k) => k.trim().length > 0).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return [{ text, match: false }];
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return text
    .split(re)
    .filter((p) => p.length > 0)
    .map((p) => ({ text: p, match: words.some((w) => new RegExp(`^${w}$`, 'i').test(p)) }));
}

/**
 * Driver-report queue (UI plan §14, §7.6; #24, #25). Pending / Confirmed tabs. Confirm keeps the
 * driver's reason and party; "Change reason / party" needs a note (5–280 characters). Reviews run
 * the server's recalculation pipeline; a report on a delivered shipment returns 409.
 */
export default function ReportsPage() {
  const [tab, setTab] = useState<ReportStatus>('PENDING_REVIEW');
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 lg:p-6">
      <div>
        <h1 className="text-h1 text-text">Driver reports</h1>
        <p className="text-body text-text-secondary">Reports count in the estimate straight away; confirming fixes the reason and party used for attribution.</p>
      </div>
      <TabsRoot value={tab} onValueChange={(v) => setTab(v as ReportStatus)}>
        <TabsList label="Report status">
          <TabsTrigger value="PENDING_REVIEW">Pending</TabsTrigger>
          <TabsTrigger value="CONFIRMED">Confirmed</TabsTrigger>
        </TabsList>
        <TabsContent value="PENDING_REVIEW" className="pt-4">
          <ReportQueue status="PENDING_REVIEW" />
        </TabsContent>
        <TabsContent value="CONFIRMED" className="pt-4">
          <ReportQueue status="CONFIRMED" />
        </TabsContent>
      </TabsRoot>
    </div>
  );
}

function ReportQueue({ status }: { status: ReportStatus }) {
  const list = useDriverReports({ status });
  if (list.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    );
  }
  if (list.isError) return <ErrorState title="Couldn't load driver reports" error={list.error} onRetry={() => void list.refetch()} />;
  if (list.data.items.length === 0) {
    return (
      <Card>
        <EmptyState icon={Inbox} title={status === 'PENDING_REVIEW' ? 'No reports waiting for review' : 'No confirmed reports yet'} />
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label={status === 'PENDING_REVIEW' ? 'Pending reports' : 'Confirmed reports'}>
      {list.data.items.map((r) => (
        <li key={r.id}>
          <ReportCard r={r} />
        </li>
      ))}
    </ul>
  );
}

export function ReportCard({ r }: { r: DriverReportDto }) {
  const review = useReviewDriverReport();
  const [changing, setChanging] = useState(false);
  const pending = r.status === 'PENDING_REVIEW';
  return (
    <Card aria-label={`Report on ${r.shipmentCode}`}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/shipments/${encodeURIComponent(r.shipmentId)}`} className="text-h3 text-primary code-label hover:underline">
            {r.shipmentCode}
          </Link>
          <span className="text-small text-text-muted tabular">
            {r.reporter.name} · {formatDayTime(r.simTime)}
          </span>
          <span className="flex-1" />
          {pending ? <Badge tone="warning">Pending review</Badge> : <Badge tone="success">Confirmed</Badge>}
        </div>

        {r.text ? (
          <blockquote className="rounded-md bg-surface-subtle px-3 py-2 text-body text-text">
            “
            {highlightParts(r.text, r.matchedKeywords).map((p, i) =>
              p.match ? (
                <mark key={i} className="rounded-sm bg-accent-subtle px-0.5 text-text">
                  {p.text}
                </mark>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
            ”
          </blockquote>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="Driver picked">{r.chipReason ? reasonLabel[r.chipReason] : 'Typed text only'}</Fact>
          <Fact label="Reason">{reasonLabel[r.reason]}</Fact>
          <Fact label="Delay used">
            {formatDuration(r.appliedMinutes)}
            {r.estimatedMinutes ? <span className="text-text-muted"> (driver: {formatDuration(r.estimatedMinutes)})</span> : null}
          </Fact>
          <Fact label="Attributed to">
            <PartyChip party={r.party} />
          </Fact>
        </dl>
        {r.suggestedReason ? (
          <p className="text-small text-text-muted">
            Keyword suggestion: {reasonLabel[r.suggestedReason]}
            {r.matchedKeywords.length ? ` (matched ${r.matchedKeywords.join(', ')})` : ''}
          </p>
        ) : null}

        {!pending ? (
          <p className="text-small text-text-secondary">
            Reviewed{r.reviewedBy ? ` by ${r.reviewedBy.name}` : ''}
            {r.reviewedAt ? ` · ${formatDayTime(r.reviewedAt)}` : ''}
            {r.originalReason || r.originalParty
              ? ` · changed from ${r.originalReason ? reasonLabel[r.originalReason] : reasonLabel[r.reason]} / ${partyLabel[r.originalParty ?? r.party]}`
              : ''}
            {r.reviewNote ? ` · “${r.reviewNote}”` : ''}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              loading={review.isPending && !changing}
              disabled={review.isPending}
              onClick={() => review.mutate({ reportId: r.id, body: { reason: r.reason, party: r.party } })}
            >
              Confirm
            </Button>
            <Button disabled={review.isPending} onClick={() => setChanging(true)}>
              Change reason / party
            </Button>
          </div>
        )}
        {!changing ? <InlineError error={review.error} /> : null}
      </div>
      {changing ? <ChangeDialog r={r} review={review} onClose={() => setChanging(false)} /> : null}
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-small text-text-muted">{label}</dt>
      <dd className="text-body text-text">{children}</dd>
    </div>
  );
}

function ChangeDialog({ r, review, onClose }: { r: DriverReportDto; review: ReturnType<typeof useReviewDriverReport>; onClose: () => void }) {
  const [reason, setReason] = useState<ReasonCode>(r.reason);
  const [party, setParty] = useState<Party>(r.party);
  const [note, setNote] = useState('');
  const n = note.trim();
  const unattributedClash = party === 'UNATTRIBUTED' && reason !== 'OTHER';
  const noteOk = n.length >= NOTE_MIN && n.length <= NOTE_MAX;
  const selectClass = 'h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-body text-text';
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Change reason / party · ${r.shipmentCode}`}
      description="The change is audited and recalculates the estimate and attribution."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!noteOk || unattributedClash}
            loading={review.isPending}
            onClick={() => review.mutate({ reportId: r.id, body: { reason, party, note: n } }, { onSuccess: onClose })}
          >
            Save review
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-body text-text">
          Reason
          <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value as ReasonCode)}>
            {REASON_CODES.map((c) => (
              <option key={c} value={c}>
                {reasonLabel[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-body text-text">
          Attributed to
          <select className={selectClass} value={party} onChange={(e) => setParty(e.target.value as Party)}>
            {PARTIES.map((p) => (
              <option key={p} value={p}>
                {partyLabel[p]}
              </option>
            ))}
          </select>
        </label>
        {unattributedClash ? <p className="text-small text-danger">Unattributed is only allowed with the reason Other.</p> : null}
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => {
            setReason('OTHER');
            setParty('UNATTRIBUTED');
          }}
        >
          Not a real delay: Other · Unattributed
        </Button>
        <div className="flex flex-col gap-1">
          <label htmlFor={`review-note-${r.id}`} className="text-body text-text">
            Note (required)
          </label>
          <textarea
            id={`review-note-${r.id}`}
            value={note}
            maxLength={NOTE_MAX}
            rows={3}
            aria-describedby={`review-note-count-${r.id}`}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-md border border-border-strong bg-surface p-2 text-body text-text"
          />
          <span id={`review-note-count-${r.id}`} className="self-end text-small text-text-muted tabular">
            {note.length}/{NOTE_MAX}
            {n.length > 0 && n.length < NOTE_MIN ? ` · at least ${NOTE_MIN} characters` : ''}
          </span>
        </div>
        <InlineError error={review.error} />
      </div>
    </Dialog>
  );
}
