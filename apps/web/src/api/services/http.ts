import { apiRequest as req } from '../client';
import type { RoutePulseApi } from './types';

const enc = encodeURIComponent;

/** Real API implementation: one line per endpoint, paths exactly as in 06_API_SPEC.md §3. */
export const httpApi: RoutePulseApi = {
  login: (body) => req('/auth/login', { method: 'POST', body }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  me: () => req('/auth/me'),
  sync: () => req('/sync'),
  simClock: (body) => req('/sim/clock', { method: 'POST', body }),
  simReset: () => req('/sim/reset', { method: 'POST', body: { confirm: true } }),
  listDisruptions: (query) => req('/disruptions', { query: { ...query } }),
  createDisruption: (body) => req('/disruptions', { method: 'POST', body }),
  endDisruption: (id) => req(`/disruptions/${enc(id)}/end`, { method: 'POST' }),
  mapLayers: () => req('/map/layers'),
  positions: () => req('/tracking/positions'),
  listOrders: (query) => req('/orders', { query: { ...query } }),
  getOrder: (id) => req(`/orders/${enc(id)}`),
  listShipments: (query) => req('/shipments', { query: { ...query } }),
  getShipment: (id) => req(`/shipments/${enc(id)}`),
  getTimeline: (id) => req(`/shipments/${enc(id)}/timeline`),
  recordMilestone: (id, body) => req(`/shipments/${enc(id)}/milestones`, { method: 'POST', body }),
  getEta: (id) => req(`/shipments/${enc(id)}/eta`),
  getReplay: (id) => req(`/shipments/${enc(id)}/replay`),
  getRules: () => req('/engine/rules'),
  getTrip: () => req('/driver/trip'),
  classify: (body) => req('/driver-reports/classify', { method: 'POST', body }),
  createDriverReport: (id, body) => req(`/shipments/${enc(id)}/driver-reports`, { method: 'POST', body }),
  listDriverReports: (query) => req('/driver-reports', { query: { ...query } }),
  reviewDriverReport: (id, body) => req(`/driver-reports/${enc(id)}/review`, { method: 'POST', body }),
  listAlerts: (query) => req('/alerts', { query: { ...query } }),
  getAlert: (id) => req(`/alerts/${enc(id)}`),
  respondToAlert: (id, body) => req(`/alerts/${enc(id)}/customer-response`, { method: 'POST', body }),
  getRecoveryOptions: (id) => req(`/shipments/${enc(id)}/recovery-options`),
  chooseRecovery: (id, optionId, body) =>
    req(`/shipments/${enc(id)}/recovery-options/${enc(optionId)}/choose`, { method: 'POST', body }),
  listNotifications: (query) => req('/notifications', { query: { ...query } }),
  markNotificationRead: (id) => req(`/notifications/${enc(id)}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => req('/notifications/read-all', { method: 'POST' }),
  getAttribution: (id) => req(`/shipments/${enc(id)}/attribution`),
  overrideAttribution: (id, body) => req(`/shipments/${enc(id)}/attribution/overrides`, { method: 'POST', body }),
  dashboard: (query) => req('/analytics/dashboard', { query: { ...query } }),
  audit: (query) => req('/audit', { query: { ...query } }),
  reference: () => req('/reference'),
};
