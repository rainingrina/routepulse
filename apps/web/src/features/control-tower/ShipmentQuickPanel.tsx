import { Link } from 'react-router';
import type { EtaExplanationCoordinator, ShipmentDetailCoordinator } from '../../api/contract';
import { useEta, useShipmentDetail } from '../../api/hooks/world';
import { ConfidenceChip, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { StatusBadge, statusForShipment } from '../../components/display/StatusBadge';
import { IconButton } from '../../components/primitives/Button';
import { ArrowLeft, ChevronRight, ICON_STROKE } from '../../components/icons';
import { milestoneLabel, t } from '../../i18n/en';
import { formatTime, formatTimeRelative } from '../../i18n/format';
import { FactorList } from '../shipment/FactorList';
import { MilestoneStepper } from '../shipment/Milestones';
import { RecoveryQuickSection } from '../recovery/RecoveryQuickSection';

/** UI plan §6.5 quick panel for the selected shipment (#15, #18, #29). */
export function ShipmentQuickPanel({
  shipmentId,
  simTime,
  onBack,
  openRecovery = false,
}: {
  shipmentId: string;
  simTime: string | undefined;
  onBack: () => void;
  /** Opened from an alert's "View options": show the full options modal at once. */
  openRecovery?: boolean;
}) {
  const detail = useShipmentDetail(shipmentId);
  const shipment = detail.data?.shipment.view === 'coordinator' ? detail.data.shipment : null;
  const arrived = !!shipment?.arrivedAt;
  const eta = useEta(shipmentId, !!shipment && !arrived);
  const etaData = eta.data?.eta.view === 'coordinator' ? eta.data.eta : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <IconButton icon={ArrowLeft} label="Back to alerts and activity" onClick={onBack} />
        <span className="text-small text-text-muted">Selected shipment</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {detail.isPending ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-16" />
            <Skeleton className="h-40" />
          </div>
        ) : detail.isError ? (
          <ErrorState compact title="Couldn't load this shipment" error={detail.error} onRetry={() => void detail.refetch()} />
        ) : shipment ? (
          <QuickContent
            s={shipment}
            eta={etaData}
            etaPending={eta.isPending && !arrived}
            etaError={eta.isError ? eta.error : null}
            onRetryEta={() => void eta.refetch()}
            simTime={simTime}
            openRecovery={openRecovery}
          />
        ) : null}
      </div>
    </div>
  );
}

function QuickContent({
  s,
  eta,
  etaPending,
  etaError,
  onRetryEta,
  simTime,
  openRecovery,
}: {
  s: ShipmentDetailCoordinator;
  eta: EtaExplanationCoordinator | null;
  etaPending: boolean;
  etaError: unknown;
  onRetryEta: () => void;
  simTime: string | undefined;
  openRecovery: boolean;
}) {
  const status = statusForShipment(s);
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-h2 text-text code-label">{s.code}</h2>
          {status ? <StatusBadge status={status} /> : null}
        </div>
        <p className="text-body text-text-secondary">
          {s.customer.name}, {s.customer.city} · {s.lane.name}
        </p>
        <p className="text-small text-text-muted">
          {s.transporter.name}
          {s.truckCode ? ` · ${s.truckCode}` : ''}
          {s.driver ? ` · Driver ${s.driver.name}` : ''} · {milestoneLabel[s.currentMilestone]}
        </p>
        <Link
          to={`/shipments/${encodeURIComponent(s.id)}`}
          className="mt-1 inline-flex items-center gap-1 self-start text-body font-medium text-primary hover:underline"
        >
          Open full detail
          <ChevronRight aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
        </Link>
      </header>

      <section aria-label="Estimated arrival" className="rounded-lg border border-border bg-surface-subtle p-3">
        {s.arrivedAt ? (
          <p className="text-body text-text tabular">
            Arrived at the receiving gate {formatTime(s.arrivedAt)} · promised by {formatTimeRelative(s.promisedBy, simTime)} ·{' '}
            <span className="font-semibold">{s.onTime ? 'on time' : 'after the promised time'}</span>
            {s.deliveredAt ? ` · delivered ${formatTime(s.deliveredAt)}` : ' · unloading in progress'}
          </p>
        ) : etaPending ? (
          <Skeleton className="h-12" />
        ) : etaError ? (
          <ErrorState compact title="Couldn't load the estimate" error={etaError} onRetry={onRetryEta} />
        ) : eta ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-small text-text-muted">Estimated arrival</dt>
              <dt className="text-small text-text-muted">Promised by</dt>
              <dd className="text-h3 text-text">
                <EtaDisplay at={eta.predictedArrivalAt} low={eta.etaLowAt} high={eta.etaHighAt} reference={simTime} />
              </dd>
              <dd className="text-h3 text-text tabular">{formatTimeRelative(eta.promisedBy, simTime)}</dd>
            </dl>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ConfidenceChip confidence={eta.confidence} />
              <span className="text-small text-text-muted">{t.ruleBased}</span>
            </div>
            <p className="mt-2 text-body text-text">{eta.summary}</p>
          </>
        ) : null}
      </section>

      <section aria-labelledby="qp-milestones">
        <h3 id="qp-milestones" className="overline mb-2 text-text-muted">
          Milestones · {milestoneLabel[s.currentMilestone]}
        </h3>
        <MilestoneStepper milestones={s.milestones} />
      </section>

      {eta ? (
        <section aria-labelledby="qp-factors">
          <h3 id="qp-factors" className="overline mb-2 text-text-muted">
            Why this estimate
          </h3>
          <FactorList factors={eta.factors} compact />
        </section>
      ) : null}

      {eta && (eta.level === 'WATCH' || eta.level === 'AT_RISK') ? <RecoveryQuickSection shipmentId={s.id} startOpen={openRecovery} /> : null}
    </div>
  );
}
