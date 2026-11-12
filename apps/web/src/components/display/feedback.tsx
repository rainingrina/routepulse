import type { ReactNode } from 'react';
import { isApiRequestError } from '../../api/client';
import { t } from '../../i18n/en';
import { cn } from '../cn';
import { Button } from '../primitives/Button';
import { CircleAlert, Info, TriangleAlert, CircleCheck, RefreshCw, ICON_STROKE, type LucideIcon } from '../icons';

// ---------- Banner ----------

export type BannerTone = 'info' | 'warning' | 'danger' | 'success' | 'accent';

const bannerTones: Record<BannerTone, { box: string; icon: LucideIcon }> = {
  info: { box: 'bg-info-tint text-text border-border', icon: Info },
  warning: { box: 'bg-warning-tint text-text border-warning/30', icon: TriangleAlert },
  danger: { box: 'bg-danger-tint text-text border-danger/30', icon: CircleAlert },
  success: { box: 'bg-success-tint text-text border-success/30', icon: CircleCheck },
  accent: { box: 'bg-accent-subtle text-text border-accent/30', icon: Info },
};

const bannerIconColor: Record<BannerTone, string> = {
  info: 'text-info',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
  accent: 'text-accent',
};

export function Banner({
  tone = 'info',
  children,
  action,
  className,
  live = false,
}: {
  tone?: BannerTone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Announce politely to screen readers. */
  live?: boolean;
}) {
  const { box, icon: Icon } = bannerTones[tone];
  return (
    <div
      role={live ? 'status' : undefined}
      className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-body', box, className)}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', bannerIconColor[tone])} strokeWidth={2} />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ---------- ErrorState ----------

/** Plain-English message for any failure. Server messages are safe to show by contract (API §1.1). */
export function errorMessage(error: unknown): string {
  if (isApiRequestError(error)) {
    if (error.kind === 'http' && error.status === 404) return t.states.notAvailable;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return t.states.somethingWrong;
}

export function errorRequestId(error: unknown): string | null {
  return isApiRequestError(error) ? error.requestId : null;
}

/** Request-error pattern from UI plan §15: title + retry, details (request id) behind a disclosure. */
export function ErrorState({
  title,
  error,
  onRetry,
  compact = false,
  className,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const is404 = isApiRequestError(error) && error.status === 404;
  const requestId = errorRequestId(error);
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-2 text-center', compact ? 'px-4 py-6' : 'px-6 py-10', className)}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-danger-tint text-danger">
        <CircleAlert aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      </span>
      <p className="text-h3 text-text">{is404 ? t.states.notAvailable : title}</p>
      <p className="max-w-sm text-body text-text-secondary">
        {is404 ? t.states.notAvailableHelp : errorMessage(error)}
      </p>
      {onRetry && !is404 ? (
        <Button size="sm" icon={RefreshCw} onClick={onRetry} className="mt-1">
          {t.states.tryAgain}
        </Button>
      ) : null}
      {requestId ? (
        <details className="mt-1 text-small text-text-muted">
          <summary className="cursor-pointer">{t.states.showDetails}</summary>
          <p className="mt-1 tabular">
            {t.states.requestId}: <span className="select-all">{requestId}</span>
          </p>
        </details>
      ) : null}
    </div>
  );
}

/** Inline error under a control (action errors, UI plan §15). */
export function InlineError({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={cn('flex items-start gap-1.5 text-small text-danger', className)}>
      <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2} />
      <span>{errorMessage(error)}</span>
    </p>
  );
}
