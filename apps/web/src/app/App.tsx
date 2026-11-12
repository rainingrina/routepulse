import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { createQueryClient, qk } from '../api/queryClient';
import { TooltipProvider } from '../components/primitives/radix';
import { ToastProvider } from '../components/primitives/toast';
import { createRouter } from './routes';
import { SESSION_EXPIRED_PARAM, SESSION_EXPIRED_VALUE } from './access';

/** Providers: TanStack Query, Radix tooltip and toast providers, React Router. */
export function App() {
  const [{ queryClient, router }] = useState(() => {
    const router = createRouter();
    let redirecting = false;
    const queryClient = createQueryClient(() => {
      // 401 on any non-auth request: the session ended (UI plan §15).
      if (redirecting) return;
      redirecting = true;
      queryClient.clear();
      queryClient.setQueryData(qk.me, null);
      void router
        .navigate(`/login?${SESSION_EXPIRED_PARAM}=${SESSION_EXPIRED_VALUE}`, { replace: true })
        .finally(() => {
          redirecting = false;
        });
    });
    return { queryClient, router };
  });

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
