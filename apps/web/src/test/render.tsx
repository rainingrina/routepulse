import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { SyncContext } from '../api/sync';
import { TooltipProvider } from '../components/primitives/radix';
import type { SyncResponse } from '../api/contract';

/**
 * Server-renders a component with a pre-filled query cache (no network): each entry is the exact
 * contract-typed response the real API returns for that query key. Errors are set on the query the
 * same way TanStack stores a failed fetch. Used by the component tests (no extra test libraries, L9).
 */
export function renderWithData(
  ui: ReactElement,
  opts: { data?: [QueryKey, unknown][]; errors?: [QueryKey, unknown][]; route?: string; path?: string; sync?: Partial<SyncResponse> } = {},
): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  for (const [key, value] of opts.data ?? []) qc.setQueryData(key, value);
  for (const [key, error] of opts.errors ?? []) {
    qc.getQueryCache().build(qc, { queryKey: key }).setState({ status: 'error', error, fetchStatus: 'idle', data: undefined, dataUpdatedAt: 0, errorUpdatedAt: 1, failureCount: 1, failureReason: error as Error, errorUpdateCount: 1, isInvalidated: false, fetchFailureCount: 1, fetchFailureReason: error as Error, fetchMeta: null, dataUpdateCount: 0 } as never);
  }
  const sync: SyncResponse = { simTime: '2026-11-19T05:40:00.000Z', running: false, speed: 1, stepMinutes: 5, worldVersion: 1, simError: null, demoMode: true, unreadNotifications: 0, ...opts.sync };
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <SyncContext.Provider value={{ sync, reconnecting: false, lastSuccessAt: 0 }}>
          <MemoryRouter initialEntries={[opts.route ?? '/']}>
            <Routes>
              <Route path={opts.path ?? '*'} element={ui} />
            </Routes>
          </MemoryRouter>
        </SyncContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Strips tags so assertions read like the visible text. */
export const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
