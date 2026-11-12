import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '../components/primitives/Button';
import { ErrorState } from '../components/display/feedback';
import { t } from '../i18n/en';

/** One error boundary per route tree (architecture §13). Render errors never show a stack trace. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6">
      {notFound ? (
        <NotFoundContent />
      ) : (
        <>
          <ErrorState title={t.states.somethingWrong} error={new Error(t.states.somethingWrongHelp)} />
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t.states.reload}
          </Button>
        </>
      )}
    </main>
  );
}

function NotFoundContent() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h1 className="text-h2 text-text">{t.states.pageNotFound}</h1>
      <p className="text-body text-text-secondary">{t.states.notAvailableHelp}</p>
      <Link to="/" className="text-body font-medium text-primary underline-offset-2 hover:underline">
        {t.states.goHome}
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <NotFoundContent />
    </main>
  );
}
