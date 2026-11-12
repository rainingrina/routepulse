import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiRequestError } from './client';
import type { Id, ShipmentListQuery, AuditQuery, DashboardQuery, OrderListQuery } from './contract';

/** Query keys follow 06_API_SPEC.md §15. */
export const qk = {
  me: ['me'] as const,
  sync: ['sync'] as const,
  rules: ['rules'] as const,
  reference: ['reference'] as const,
  shipments: (filters: ShipmentListQuery) => ['shipments', filters] as const,
  shipment: (id: Id) => ['shipment', id] as const,
  eta: (id: Id) => ['eta', id] as const,
  timeline: (id: Id) => ['timeline', id] as const,
  recoveryOptions: (id: Id) => ['recoveryOptions', id] as const,
  alerts: (filters: object) => ['alerts', filters] as const,
  alert: (id: Id) => ['alert', id] as const,
  notifications: ['notifications'] as const,
  driverReports: (filters: object) => ['driverReports', filters] as const,
  trip: ['trip'] as const,
  dashboard: (filters: DashboardQuery) => ['dashboard', filters] as const,
  replay: (id: Id) => ['replay', id] as const,
  positions: ['positions'] as const,
  mapLayers: ['mapLayers'] as const,
  attribution: (id: Id) => ['attribution', id] as const,
  audit: (filters: AuditQuery) => ['audit', filters] as const,
  disruptions: (filters: object) => ['disruptions', filters] as const,
  orders: (filters: OrderListQuery) => ['orders', filters] as const,
  order: (id: Id) => ['order', id] as const,
  /** Offline basemap file present (HEAD /tiles/…); not world state. */
  basemap: ['basemap'] as const,
};

/** Keys that are not world state and must not be refetched on a `worldVersion` change. */
const NOT_WORLD_STATE = new Set(['me', 'sync', 'rules', 'basemap']);

export function isWorldStateKey(queryKey: readonly unknown[]): boolean {
  return !NOT_WORLD_STATE.has(String(queryKey[0]));
}

/**
 * Architecture §13: GET retried twice; 4xx never retried (they will not change); mutations never retried.
 * TanStack passes the number of failures so far, starting at 0.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (isApiRequestError(error)) {
    if (error.kind === 'unavailable') return false;
    if (error.kind === 'http' && error.status !== null && error.status < 500) return false;
  }
  return true;
}

/** A 401 from anything except the auth probes means the session ended (UI plan §15). */
export function isSessionExpiry(error: unknown, meta: Record<string, unknown> | undefined): boolean {
  return isApiRequestError(error) && error.status === 401 && meta?.authProbe !== true;
}

export function createQueryClient(onSessionExpired: () => void): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isSessionExpiry(error, query.meta)) onSessionExpired();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (isSessionExpiry(error, mutation.meta)) onSessionExpired();
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: 5_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
