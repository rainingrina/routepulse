import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useMe } from '../api/hooks/auth';
import { SyncProvider } from '../api/sync';
import type { Role } from '../api/contract';
import { CurrentUserContext } from './currentUser';
import { ErrorState } from '../components/display/feedback';
import { decideAccess, HOME_PATH } from './access';
import { FullPageLoading } from './FullPageLoading';

/** Role guard for one route tree (architecture §5.1). Starts the 1 s sync poll once signed in. */
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <FullPageLoading />;
  if (me.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <ErrorState title="Couldn't check your session" error={me.error} onRetry={() => void me.refetch()} />
      </main>
    );
  }
  const decision = decideAccess(me.data, role);
  if (decision.kind === 'login') return <Navigate to="/login" replace />;
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />;
  return (
    <CurrentUserContext.Provider value={me.data}>
      <SyncProvider>{children}</SyncProvider>
    </CurrentUserContext.Provider>
  );
}

/** `/` — send a signed-in user to their home, everyone else to login. */
export function HomeRedirect() {
  const me = useMe();
  if (me.isPending) return <FullPageLoading />;
  if (me.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <ErrorState title="Couldn't check your session" error={me.error} onRetry={() => void me.refetch()} />
      </main>
    );
  }
  return <Navigate to={me.data ? HOME_PATH[me.data.role] : '/login'} replace />;
}
