import { CUSTOMER_RESPONSES, type CustomerAlertDto, type CustomerResponse } from '../../api/contract';
import { useRespondToAlert } from '../../api/hooks/portal';
import { useSync } from '../../api/sync';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { InlineError } from '../../components/display/feedback';
import { TriangleAlert } from '../../components/icons';
import { Button } from '../../components/primitives/Button';
import { customerResponseAction, customerResponseLabel } from '../../i18n/en';
import { formatDayTime } from '../../i18n/format';

/**
 * Customer alert banner (UI plan §11.1, AC-M4.6): plain words only — the reason, the proposed or
 * confirmed action from the server, and three response buttons. No parties, codes or driver.
 * "Accept proposal" is offered only when the server has a proposal to accept.
 */
export function CustomerAlertBanner({ alert }: { alert: CustomerAlertDto }) {
  const { sync } = useSync();
  const respond = useRespondToAlert();
  const late = alert.predictedArrivalAt > alert.promisedBy;
  const responses = CUSTOMER_RESPONSES.filter((r) => r !== 'ACCEPT_PROPOSAL' || alert.action?.label === 'PROPOSED');
  const send = (response: CustomerResponse) => respond.mutate({ alertId: alert.id, body: { response } });

  return (
    <section
      aria-label={`Alert for order ${alert.orderCode}`}
      className="relative overflow-hidden rounded-xl border border-border bg-surface py-4 pr-4 pl-5 shadow-xs"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${late ? 'bg-danger' : 'bg-warning'}`} />
      <div className="flex flex-col gap-2">
        <p className="flex items-start gap-2 text-body font-semibold text-text">
          <TriangleAlert aria-hidden className={`mt-0.5 size-4 shrink-0 ${late ? 'text-danger' : 'text-warning'}`} strokeWidth={2} />
          Order {alert.orderCode} is at risk of missing {formatDayTime(alert.promisedBy)}
        </p>
        <p className="text-body text-text">
          Estimated arrival{' '}
          <EtaDisplay at={alert.predictedArrivalAt} low={alert.etaLowAt} high={alert.etaHighAt} reference={sync?.simTime} className="font-medium" />
          {' · '}
          {alert.plainReason}
        </p>
        <p className="text-body text-text-secondary">{alert.action ? alert.action.text : 'Plant X team is reviewing options.'}</p>

        {alert.customerResponse ? (
          <p role="status" className="text-body font-medium text-text">
            Thanks — Plant X will confirm shortly. Your response: {customerResponseLabel[alert.customerResponse]}.
          </p>
        ) : null}

        {alert.canRespond ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Respond to the alert for order ${alert.orderCode}`}>
            {responses.map((r) => (
              <Button
                key={r}
                size="md"
                variant={r === 'ACCEPT_PROPOSAL' ? 'primary' : 'secondary'}
                loading={respond.isPending && respond.variables?.body.response === r}
                disabled={respond.isPending}
                onClick={() => send(r)}
              >
                {customerResponseAction[r]}
              </Button>
            ))}
          </div>
        ) : null}
        <InlineError error={respond.error} />
      </div>
    </section>
  );
}
