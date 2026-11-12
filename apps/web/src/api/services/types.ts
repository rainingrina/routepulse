import type * as C from '../contract';

/**
 * One method per endpoint in 06_API_SPEC.md §3. Components never call these directly;
 * they use the hooks in `api/hooks`. Two implementations: `http.ts` (real API) and
 * `mocks/mockApi.ts` (development only, `vite --mode mock`).
 */
export interface RoutePulseApi {
  // §4 auth (#1–#3)
  login(body: C.LoginRequest): Promise<C.LoginResponse>;
  logout(): Promise<void>;
  me(): Promise<C.MeResponse>;
  // §5 sync and simulation (#4–#9)
  sync(): Promise<C.SyncResponse>;
  simClock(body: C.SimClockRequest): Promise<C.SimClockResponse>;
  simReset(): Promise<C.SimResetResponse>;
  listDisruptions(query?: { active?: 'true' | 'false' }): Promise<C.ListResponse<C.DisruptionDto>>;
  createDisruption(body: C.CreateDisruptionRequest): Promise<C.CreateDisruptionResponse>;
  endDisruption(disruptionId: C.Id): Promise<C.CreateDisruptionResponse>;
  // §6 map (#10–#11)
  mapLayers(): Promise<C.MapLayersResponse>;
  positions(): Promise<C.PositionsResponse>;
  // §7 orders and shipments (#12–#17)
  listOrders(query?: C.OrderListQuery): Promise<C.ListResponse<C.OrderSummary>>;
  getOrder(orderId: C.Id): Promise<C.OrderDetail>;
  listShipments(query?: C.ShipmentListQuery): Promise<C.ListResponse<C.ShipmentListItem>>;
  getShipment(shipmentId: C.Id): Promise<{ shipment: C.ShipmentDetail }>;
  getTimeline(shipmentId: C.Id): Promise<C.ListResponse<C.TimelineEvent>>;
  recordMilestone(shipmentId: C.Id, body: C.RecordMilestoneRequest): Promise<C.RecordMilestoneResponse>;
  // §8 ETA (#18–#20)
  getEta(shipmentId: C.Id): Promise<{ eta: C.EtaExplanationCoordinator | C.EtaSummaryCustomer }>;
  getReplay(shipmentId: C.Id): Promise<C.ReplayResponse>;
  getRules(): Promise<C.EngineRulesResponse>;
  // §9 driver (#21–#25)
  getTrip(): Promise<C.DriverTripResponse>;
  classify(body: C.ClassifyRequest): Promise<C.ClassifyResponse>;
  createDriverReport(shipmentId: C.Id, body: C.CreateDriverReportRequest): Promise<C.CreateDriverReportResponse>;
  listDriverReports(query?: {
    status?: C.ReportStatus;
    shipmentId?: C.Id;
    limit?: number;
  }): Promise<C.ListResponse<C.DriverReportDto>>;
  reviewDriverReport(reportId: C.Id, body: C.ReviewDriverReportRequest): Promise<C.ReviewDriverReportResponse>;
  // §10 alerts and recovery (#26–#30)
  listAlerts(query?: {
    status?: C.AlertStatus | 'active';
    shipmentId?: C.Id;
    limit?: number;
  }): Promise<C.ListResponse<C.AlertDto>>;
  getAlert(alertId: C.Id): Promise<{ alert: C.AlertDto }>;
  respondToAlert(alertId: C.Id, body: C.CustomerResponseRequest): Promise<{ alert: C.CustomerAlertDto }>;
  getRecoveryOptions(shipmentId: C.Id): Promise<C.RecoveryOptionsResponse>;
  chooseRecovery(shipmentId: C.Id, optionId: C.Id, body: C.ChooseRecoveryRequest): Promise<C.ChooseRecoveryResponse>;
  // §11 notifications (#31–#33)
  listNotifications(query?: { unreadOnly?: 'true' | 'false'; limit?: number }): Promise<C.NotificationsResponse>;
  markNotificationRead(notificationId: C.Id): Promise<{ notification: C.NotificationDto; unreadCount: number }>;
  markAllNotificationsRead(): Promise<{ updated: number; unreadCount: 0 }>;
  // §12 attribution (#34–#35)
  getAttribution(shipmentId: C.Id): Promise<C.AttributionResponse>;
  overrideAttribution(shipmentId: C.Id, body: C.AttributionOverrideRequest): Promise<C.AttributionResponse>;
  // §13–§14a (#36–#38)
  dashboard(query?: C.DashboardQuery): Promise<C.DashboardResponse>;
  audit(query?: C.AuditQuery): Promise<C.AuditResponse>;
  reference(): Promise<C.ReferenceResponse>;
}
