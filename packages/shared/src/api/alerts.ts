import type { AlertStatus, CustomerResponse, NotificationKind, OptionStatus, RecoveryKind } from '../enums.js';
import type { Id, ISODateTime, Minutes } from './common.js';
import type { AlertSummary } from './shipments.js';

/** API spec §2.2, §10, §11 (#26–#28, #31–#33). RecoveryOptionDto is published for the alert shape; options are generated from Milestone 8. */

export interface RecoveryOptionDto {
  id: Id;
  optionSetId: string;
  kind: RecoveryKind;
  title: string;
  feasible: boolean;
  infeasibleReason: string | null;
  newEtaAt: ISODateTime | null;
  etaLowAt: ISODateTime | null;
  etaHighAt: ISODateTime | null;
  meetsPromise: boolean;
  minutesSavedVsNotify: Minutes;
  newWindowEnd: ISODateTime | null;
  extraCostInr: number;
  costNote: string;
  co2eDeltaKg: number | null;
  co2eNote: string;
  isSuggested: boolean;
  constraints: string[];
  status: OptionStatus;
}

export interface AlertDtoCoordinator extends AlertSummary {
  view: 'coordinator';
  shipment: { id: Id; code: string; customerName: string; laneName: string };
  resolvedAt: ISODateTime | null;
  summary: string;
  proposedOption: RecoveryOptionDto | null;
  chosenOption: RecoveryOptionDto | null;
  chosenBy: { id: Id; name: string } | null;
  chosenAt: ISODateTime | null;
  customerResponse: CustomerResponse | null;
  customerRespondedAt: ISODateTime | null;
}

export interface CustomerAlertDto {
  view: 'customer';
  id: Id;
  status: AlertStatus;
  openedAt: ISODateTime;
  shipmentId: Id;
  shipmentCode: string;
  orderCode: string;
  predictedArrivalAt: ISODateTime;
  etaLowAt: ISODateTime;
  etaHighAt: ISODateTime;
  promisedBy: ISODateTime;
  plainReason: string;
  action: { label: 'PROPOSED' | 'CONFIRMED'; kind: RecoveryKind; text: string } | null;
  customerResponse: CustomerResponse | null;
  customerRespondedAt: ISODateTime | null;
  canRespond: boolean;
}

export type AlertDto = AlertDtoCoordinator | CustomerAlertDto;

export interface NotificationDto {
  id: Id;
  kind: NotificationKind;
  templateKey: string;
  params: Record<string, string | number>;
  text: string;
  simTime: ISODateTime;
  readAt: ISODateTime | null;
  shipmentId: Id | null;
  shipmentCode: string | null;
  alertId: Id | null;
}

export interface CustomerResponseRequest {
  response: CustomerResponse;
}

export interface NotificationsResponse {
  items: NotificationDto[];
  unreadCount: number;
}
