import type { ReactNode } from 'react';
import { cn } from '../cn';
import { ICON_STROKE, type LucideIcon } from '../icons';
import { Skeleton } from './basics';

export type KpiTone = 'neutral' | 'danger' | 'warning';

/** UI plan §6.2: overline label, `kpi` value, small caption. Whole card is the button. */
export function KpiCard({
  label,
  value,
  caption,
  tone = 'neutral',
  icon: Icon,
  onClick,
  pressed,
  loading,
  unavailable,
  title,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: KpiTone;
  icon?: LucideIcon;
  onClick?: () => void;
  pressed?: boolean;
  loading?: boolean;
  /** Shown instead of the value when the source failed. */
  unavailable?: string | null;
  title?: string;
}) {
  const toneClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-text';
  const body = (
    <>
      <span className="text-small font-medium text-text-muted">{label}</span>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-16" />
      ) : unavailable ? (
        <span className="mt-1 text-body text-text-muted">{unavailable}</span>
      ) : (
        <span className={cn('mt-1 flex items-center gap-1.5 text-kpi tracking-tight tabular', toneClass)}>
          {Icon ? <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} /> : null}
          {value}
        </span>
      )}
      {caption ? <span className="mt-0.5 max-w-full truncate text-small text-text-muted">{caption}</span> : null}
    </>
  );
  const base = 'flex min-w-[148px] flex-1 flex-col items-start rounded-xl border bg-surface px-4 py-3 text-left shadow-xs';
  if (!onClick) return <div className={cn(base, 'border-border')}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={title}
      className={cn(
        base,
        'transition-colors duration-[var(--rp-motion-fast)] hover:border-border-strong',
        pressed ? 'border-text bg-primary-subtle/60' : 'border-border hover:bg-surface-subtle',
      )}
    >
      {body}
    </button>
  );
}
