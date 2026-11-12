import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services';
import { isWorldStateKey, qk } from '../queryClient';
import { useSync } from '../sync';
import type {
  AlertStatus,
  AuditQuery,
  CreateDisruptionRequest,
  DashboardQuery,
  Id,
  ReportStatus,
  ShipmentListQuery,
  SimClockRequest,
  SyncResponse,
} from '../contract';

const POSITIONS_INTERVAL_MS = 1_000;

/** #14 */
export function useShipments(filters: ShipmentListQuery) {
  return useQuery({
    queryKey: qk.shipments(filters),
    queryFn: () => api().listShipments(filters),
    placeholderData: keepPreviousData,
  });
}

/** #15 */
export function useShipmentDetail(id: Id | null) {
  return useQuery({
    queryKey: qk.shipment(id ?? ''),
    queryFn: () => api().getShipment(id!),
    enabled: !!id,
  });
}

/** #18 — not requested for shipments that have arrived (API returns 409 then). */
export function useEta(id: Id | null, enabled = true) {
  return useQuery({
    queryKey: qk.eta(id ?? ''),
    queryFn: () => api().getEta(id!),
    enabled: !!id && enabled,
  });
}

/** #29 */
export function useRecoveryOptions(id: Id | null, enabled = true) {
  return useQuery({
    queryKey: qk.recoveryOptions(id ?? ''),
    queryFn: () => api().getRecoveryOptions(id!),
    enabled: !!id && enabled,
  });
}

/** #30 — never retried; on 409 STALE_OPTIONS the caller refetches the options (UI plan §9.2). */
export function useChooseRecovery(shipmentId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { optionId: Id; optionSetId: string; note?: string }) =>
      api().chooseRecovery(shipmentId, v.optionId, {
        optionSetId: v.optionSetId,
        confirm: true,
        ...(v.note ? { note: v.note } : {}),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ predicate: (q) => isWorldStateKey(q.queryKey) });
    },
  });
}

/** #10 */
export function useMapLayers() {
  return useQuery({ queryKey: qk.mapLayers, queryFn: () => api().mapLayers(), staleTime: 60_000 });
}

/** #11 — polled every second while the clock runs (API §15). */
export function usePositions() {
  const { sync } = useSync();
  return useQuery({
    queryKey: qk.positions,
    queryFn: () => api().positions(),
    refetchInterval: sync?.running ? POSITIONS_INTERVAL_MS : false,
  });
}

/** #26 */
export function useAlerts(filters: { status?: AlertStatus | 'active'; shipmentId?: Id; limit?: number } = {}) {
  return useQuery({ queryKey: qk.alerts(filters), queryFn: () => api().listAlerts(filters) });
}

/** #24 */
export function useDriverReports(filters: { status?: ReportStatus; shipmentId?: Id; limit?: number } = {}) {
  return useQuery({ queryKey: qk.driverReports(filters), queryFn: () => api().listDriverReports(filters) });
}

/** #36 */
export function useDashboard(filters: DashboardQuery) {
  return useQuery({
    queryKey: qk.dashboard(filters),
    queryFn: () => api().dashboard(filters),
    placeholderData: keepPreviousData,
  });
}

/** #37 — also the activity feed source (L7). */
export function useAudit(filters: AuditQuery, enabled = true) {
  return useQuery({ queryKey: qk.audit(filters), queryFn: () => api().audit(filters), enabled });
}

/** #31 */
export function useNotifications() {
  return useQuery({ queryKey: qk.notifications, queryFn: () => api().listNotifications({ limit: 50 }) });
}

/** #32 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => api().markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      void queryClient.invalidateQueries({ queryKey: qk.sync });
    },
  });
}

/** #33 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api().markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      void queryClient.invalidateQueries({ queryKey: qk.sync });
    },
  });
}

/** #6 — coordinator + DEMO_MODE. Clears all world state after the reseed. */
export function useSimReset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api().simReset(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]) !== 'me' });
    },
  });
}

/** #5 — coordinator + DEMO_MODE. Updates the sync cache with the returned clock state. */
export function useSimClock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SimClockRequest) => api().simClock(body),
    onSuccess: (state) => {
      queryClient.setQueryData<SyncResponse>(qk.sync, (prev) => ({
        ...state,
        unreadNotifications: prev?.unreadNotifications ?? 0,
      }));
      void queryClient.invalidateQueries({ predicate: (q) => isWorldStateKey(q.queryKey) });
    },
  });
}

/** #16 */
export function useTimeline(id: Id | null) {
  return useQuery({ queryKey: qk.timeline(id ?? ''), queryFn: () => api().getTimeline(id!), enabled: !!id });
}

/** #34 — coordinator only. */
export function useAttribution(id: Id | null) {
  return useQuery({ queryKey: qk.attribution(id ?? ''), queryFn: () => api().getAttribution(id!), enabled: !!id });
}

/** #38 — reference lists (segments for the disruption form). */
export function useReference() {
  return useQuery({ queryKey: qk.reference, queryFn: () => api().reference(), staleTime: 60_000 });
}

/** #7 */
export function useDisruptions(filters: { active?: 'true' | 'false' } = {}) {
  return useQuery({ queryKey: qk.disruptions(filters), queryFn: () => api().listDisruptions(filters) });
}

/** #8 — coordinator + DEMO_MODE. The server runs the recalculation pipeline; everything world-state is refetched. */
export function useCreateDisruption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDisruptionRequest) => api().createDisruption(body),
    onSettled: () => {
      void queryClient.invalidateQueries({ predicate: (q) => isWorldStateKey(q.queryKey) });
    },
  });
}

/** #9 — coordinator + DEMO_MODE. */
export function useEndDisruption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => api().endDisruption(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ predicate: (q) => isWorldStateKey(q.queryKey) });
    },
  });
}
