import { CUSTOMER_RESPONSES, type CustomerAlertDto, type CustomerResponse } from '../../api/contract';
import { useRespondToAlert } from '../../api/hooks/portal';
import { useSync } from '../../api/sync';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { Banner, InlineError } from '../../components/display/feedback';
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
    <Banner tone={late ? 'danger' : 'warning'} className="py-3">
      <div className="flex flex-col gap-2">
        <p className="text-body font-semibold text-text">
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
    </Banner>
  );
}
