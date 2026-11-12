import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services';
import { isWorldStateKey, qk } from '../queryClient';
import type {
  ClassifyRequest,
  CreateDriverReportRequest,
  CustomerResponseRequest,
  Id,
  OrderListQuery,
  RecordMilestoneRequest,
  ReviewDriverReportRequest,
} from '../contract';

/**
 * Milestone 9 portal hooks: orders (#12, #13), milestone taps (#17), replay (#19), driver trip
 * (#21), classify / report (#22, #23), report review (#25) and the customer response (#28).
 * Mutations are never retried; after any write every world-state query is refetched, because the
 * server ran the single recalculation pipeline.
 */

function useInvalidateWorld() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ predicate: (q) => isWorldStateKey(q.queryKey) });
    void queryClient.invalidateQueries({ queryKey: qk.sync });
  };
}

/** #12 */
export function useOrders(filters: OrderListQuery = {}) {
  return useQuery({ queryKey: qk.orders(filters), queryFn: () => api().listOrders(filters) });
}

/** #13 */
export function useOrder(id: Id | null) {
  return useQuery({ queryKey: qk.order(id ?? ''), queryFn: () => api().getOrder(id!), enabled: !!id });
}

/** #19 — coordinator; read-only history. */
export function useReplay(id: Id | null) {
  return useQuery({ queryKey: qk.replay(id ?? ''), queryFn: () => api().getReplay(id!), enabled: !!id });
}

/** #21 — driver. */
export function useTrip() {
  return useQuery({ queryKey: qk.trip, queryFn: () => api().getTrip() });
}

/** #17 — driver tap or coordinator override. 409 messages are shown as returned (plain English). */
export function useRecordMilestone(shipmentId: Id) {
  const invalidate = useInvalidateWorld();
  return useMutation({
    mutationFn: (body: RecordMilestoneRequest) => api().recordMilestone(shipmentId, body),
    onSettled: invalidate,
  });
}

/** #22 — stateless suggestion; writes nothing. */
export function useClassify() {
  return useMutation({ mutationFn: (body: ClassifyRequest) => api().classify(body) });
}

/** #23 */
export function useCreateDriverReport(shipmentId: Id) {
  const invalidate = useInvalidateWorld();
  return useMutation({
    mutationFn: (body: CreateDriverReportRequest) => api().createDriverReport(shipmentId, body),
    onSettled: invalidate,
  });
}

/** #25 — coordinator. */
export function useReviewDriverReport() {
  const invalidate = useInvalidateWorld();
  return useMutation({
    mutationFn: (v: { reportId: Id; body: ReviewDriverReportRequest }) => api().reviewDriverReport(v.reportId, v.body),
    onSettled: invalidate,
  });
}

/** #28 — customer. */
export function useRespondToAlert() {
  const invalidate = useInvalidateWorld();
  return useMutation({
    mutationFn: (v: { alertId: Id; body: CustomerResponseRequest }) => api().respondToAlert(v.alertId, v.body),
    onSettled: invalidate,
  });
}
