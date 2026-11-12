import { Skeleton } from '../components/display/basics';

/** First-load skeleton for the app shell (UI plan §15: skeletons shaped like the content, no spinner page). */
export function FullPageLoading() {
  return (
    <div role="status" aria-label="Loading RoutePulse" className="min-h-screen">
      <div className="flex h-16 items-center gap-6 border-b border-border bg-surface px-6">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-64" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex flex-col gap-4 p-6">
        <div className="flex gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 flex-1" />
          ))}
        </div>
        <Skeleton className="h-[60vh] w-full" />
      </div>
    </div>
  );
}

/** Suspense fallback inside a layout. */
export function PageLoading() {
  return (
    <div role="status" aria-label="Loading page" className="flex flex-col gap-4 p-6">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
