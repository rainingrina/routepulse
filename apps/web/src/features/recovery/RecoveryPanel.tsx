import { useState } from 'react';
import type { AlertDtoCoordinator, ChooseRecoveryResponse, RecoveryOptionDto } from '../../api/contract';
import { isApiRequestError } from '../../api/client';
import { useAlerts, useChooseRecovery, useRecoveryOptions } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { EmptyState, Skeleton } from '../../components/display/basics';
import { Banner, ErrorState } from '../../components/display/feedback';
import { Button } from '../../components/primitives/Button';
import { CircleCheck, RefreshCw } from '../../components/icons';
import { customerResponseLabel, recoveryKindLabel } from '../../i18n/en';
import { formatDayTime, formatTime, formatTimeRelative } from '../../i18n/format';
import { useToast } from '../../components/primitives/toast';
import { ConfirmRecoveryDialog } from './ConfirmRecoveryDialog';
import { RecoveryCard } from './RecoveryCard';
import { decisionMade, orderOptions } from './order';

/** Full recovery view (UI plan §9): suggestion rule, customer response, ordered cards, choose flow (#29, #30). */
export function RecoveryPanel({ shipmentId, onlySuggested = false }: { shipmentId: string; onlySuggested?: boolean }) {
  const { toast } = useToast();
  const { sync } = useSync();
  const options = useRecoveryOptions(shipmentId);
  const alerts = useAlerts({ status: 'active', shipmentId });
  const choose = useChooseRecovery(shipmentId);
  const [pick, setPick] = useState<RecoveryOptionDto | null>(null);
  const [result, setResult] = useState<ChooseRecoveryResponse | null>(null);
  const alert = (alerts.data?.items[0] ?? null) as AlertDtoCoordinator | null;

  if (options.isPending) return <Skeleton className="h-40" />;
  if (options.isError) return <ErrorState compact title="Couldn't load recovery options" error={options.error} onRetry={() => void options.refetch()} />;

  const data = options.data;
  if (!data.optionSetId || data.options.length === 0) {
    return <EmptyState icon={CircleCheck} title="No recovery needed" help="Options are generated when a shipment is Watch or At risk." className="py-6" />;
  }

  const ordered = orderOptions(data.options);
  const decided = decisionMade(data.options);
  const shown = onlySuggested ? ordered.filter((o) => o.isSuggested || o.status === 'CHOSEN' || o.status === 'AWAITING_CUSTOMER').slice(0, 1) : ordered;
  const err = choose.error;
  const stale = isApiRequestError(err) && err.code === 'STALE_OPTIONS';
  const already = isApiRequestError(err) && err.code === 'ALREADY_DONE';
  const chosenLine = alert?.chosenBy && alert.chosenAt ? `Chosen by ${alert.chosenBy.name} at ${formatTime(alert.chosenAt)}` : null;

  return (
    <div className="flex flex-col gap-3">
      {!onlySuggested ? <p className="text-small text-text-secondary">{data.suggestionRule}</p> : null}
      {alert?.customerResponse ? (
        <Banner tone="info">
          Customer {customerResponseLabel[alert.customerResponse].toLowerCase()}
          {alert.customerRespondedAt ? ` at ${formatTime(alert.customerRespondedAt)}` : ''}.
        </Banner>
      ) : null}
      {stale || already ? (
        <Banner
          tone="warning"
          live
          action={
            <Button size="sm" icon={RefreshCw} onClick={() => { choose.reset(); void options.refetch(); }}>
              Refresh
            </Button>
          }
        >
          {stale ? 'Options changed — review the updated cards. Nothing was applied.' : 'An option was already chosen for this alert.'}
        </Banner>
      ) : null}
      {result ? (
        <Banner tone="success" live>
          Recovery confirmed: {recoveryKindLabel[result.option.kind]}. New estimate {formatTimeRelative(result.eta.predictedArrivalAt, sync?.simTime)}.
          {result.driverChange ? ` Driver changed: ${result.driverChange.fromDriverName} → ${result.driverChange.toDriverName} (${result.driverChange.toTruckCode}).` : ''}
          {result.customerNotified ? ' Customer notified.' : ''}
        </Banner>
      ) : null}
      <ul className="flex flex-col gap-3 pt-1">
        {shown.map((o) => (
          <li key={o.id}>
            <RecoveryCard
              option={o}
              simTime={sync?.simTime}
              canChoose={!decided && !choose.isPending}
              onChoose={() => {
                choose.reset();
                setPick(o);
              }}
              chosenLine={o.status === 'CHOSEN' ? chosenLine : null}
            />
          </li>
        ))}
      </ul>
      <ConfirmRecoveryDialog
        option={pick}
        simTime={sync?.simTime}
        open={!!pick && !stale && !already}
        onOpenChange={(o) => {
          if (!o) setPick(null);
        }}
        pending={choose.isPending}
        error={stale || already ? null : err}
        onConfirm={(note) => {
          if (!pick || !data.optionSetId) return;
          choose.mutate(
            { optionId: pick.id, optionSetId: data.optionSetId, ...(note ? { note } : {}) },
            {
              onSuccess: (res) => {
                setResult(res);
                setPick(null);
                toast({ title: `${recoveryKindLabel[res.option.kind]} chosen`, description: `Recalculated at the decision minute${res.option.newEtaAt ? ` · new estimate ${formatDayTime(res.option.newEtaAt)}` : ''}.` });
              },
            },
          );
        }}
      />
    </div>
  );
}
