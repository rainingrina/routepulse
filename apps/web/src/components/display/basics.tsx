import type { ReactNode } from 'react';
import type { Confidence, Party } from '../../api/contract';
import { confidenceLabel, partyLabel } from '../../i18n/en';
import { cn } from '../cn';
import { ICON_STROKE, type LucideIcon } from '../icons';

// ---------- Card ----------

export function Card({
  children,
  className,
  as: As = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article' | 'aside';
} & Record<`aria-${string}`, string | undefined>) {
  return (
    <As className={cn('rounded-lg border border-border bg-surface shadow-xs', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  eyebrow,
  actions,
  className,
  titleAs: H = 'h2',
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleAs?: 'h2' | 'h3';
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow text-text-muted">{eyebrow}</p> : null}
        <H className="text-h3 text-text">{title}</H>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------- Badge ----------

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'warning' | 'danger' | 'success';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  primary: 'bg-primary-subtle text-primary',
  accent: 'bg-accent-subtle text-accent',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  success: 'bg-success-tint text-success',
};

export function Badge({
  children,
  tone = 'neutral',
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-small font-medium whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden className="size-3" strokeWidth={2} /> : null}
      {children}
    </span>
  );
}

/** Count badge for nav items and the bell. */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={label}
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-none font-semibold text-on-primary tabular"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

// ---------- ConfidenceChip / PartyChip ----------

export function ConfidenceChip({ confidence, className }: { confidence: Confidence; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-5 items-center rounded-full border border-border-strong px-2 text-small whitespace-nowrap text-text-secondary',
        className,
      )}
    >
      Confidence {confidenceLabel[confidence]}
    </span>
  );
}

export const partySwatch: Record<Party, string> = {
  PLANT: 'bg-party-plant',
  TRANSPORTER: 'bg-party-transporter',
  CUSTOMER: 'bg-party-customer',
  EXTERNAL: 'bg-party-external',
  UNATTRIBUTED: 'bg-party-unattributed',
};

/** Party label with its chart swatch (never colour alone: the text is the label). */
export function PartyChip({ party }: { party: Party }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-small text-text-secondary">
      <span aria-hidden className={cn('size-2.5 rounded-[2px]', partySwatch[party])} />
      {partyLabel[party]}
    </span>
  );
}

// ---------- Skeleton ----------

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-sunken', className)} />;
}

// ---------- EmptyState ----------

export function EmptyState({
  icon: Icon,
  title,
  help,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  help?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
        <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      </span>
      <p className="text-h3 text-text">{title}</p>
      {help ? <p className="max-w-sm text-body text-text-secondary">{help}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ---------- Stat line ----------

export function KeyValue({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <dt className="text-small text-text-muted">{label}</dt>
      <dd className="text-body text-text">{children}</dd>
    </div>
  );
}
