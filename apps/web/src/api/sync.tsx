import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './services';
import { isWorldStateKey, qk } from './queryClient';
import type { SyncResponse } from './contract';

/** Architecture §5.2 / UI plan §15. */
export const SYNC_INTERVAL_MS = 1_000;
export const RECONNECT_AFTER_FAILURES = 3;

export interface SyncState {
  sync: SyncResponse | undefined;
  /** True after 3 consecutive failed polls; data stays visible but is marked stale. */
  reconnecting: boolean;
  /** Wall-clock ms of the last successful poll. */
  lastSuccessAt: number | null;
}

export const SyncContext = createContext<SyncState>({ sync: undefined, reconnecting: false, lastSuccessAt: null });

/** Polls GET /api/sync every second and invalidates world-state queries when `worldVersion` changes. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [failures, setFailures] = useState(0);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);

  const query = useQuery({
    queryKey: qk.sync,
    queryFn: async () => {
      try {
        const result = await api().sync();
        setFailures(0);
        setLastSuccessAt(Date.now());
        return result;
      } catch (e) {
        setFailures((f) => f + 1);
        throw e;
      }
    },
    refetchInterval: SYNC_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
  });

  const lastVersion = useRef<number | null>(null);
  const version = query.data?.worldVersion;
  useEffect(() => {
    if (version === undefined) return;
    if (lastVersion.current !== null && lastVersion.current !== version) {
      void queryClient.invalidateQueries({ predicate: (q) => isWorldStateKey(q.queryKey) });
    }
    lastVersion.current = version;
  }, [version, queryClient]);

  return (
    <SyncContext.Provider
      value={{ sync: query.data, reconnecting: failures >= RECONNECT_AFTER_FAILURES, lastSuccessAt }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncState {
  return useContext(SyncContext);
}
