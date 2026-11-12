/**
 * Thin styled wrappers over Radix primitives (L9). Behaviour (focus trap, Esc, roving focus,
 * ARIA) comes from Radix; this file only applies RoutePulse tokens.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Dialog as D, Tabs as T, ToggleGroup as G, Tooltip as TT } from 'radix-ui';
import { cn } from '../cn';
import { X, ICON_STROKE } from '../icons';

// ---------- SegmentedControl (single select) ----------

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  ariaLabel?: string;
}

export function SegmentedControl<V extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  disabled,
  tone = 'light',
}: {
  value: V;
  onChange: (v: V) => void;
  options: SegmentOption<V>[];
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** `dark` for controls placed on the graphite application bar. */
  tone?: 'light' | 'dark';
}) {
  return (
    <G.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as V);
      }}
      aria-label={label}
      disabled={disabled}
      className={cn('inline-flex rounded-full border p-0.5', tone === 'dark' ? 'border-nav-border bg-transparent' : 'border-border bg-surface-subtle')}
    >
      {options.map((o) => (
        <G.Item
          key={o.value}
          value={o.value}
          aria-label={o.ariaLabel}
          className={cn(
            'rounded-full px-3 font-medium transition-colors duration-[var(--rp-motion-fast)] tabular disabled:opacity-60',
            size === 'sm' ? 'h-7 text-small' : 'h-8 text-body',
            tone === 'dark'
              ? 'text-nav-text hover:text-nav-text-strong data-[state=on]:bg-nav-active data-[state=on]:text-nav-active-text'
              : 'text-text-secondary hover:text-text data-[state=on]:bg-primary-subtle data-[state=on]:text-text data-[state=on]:shadow-xs',
          )}
        >
          {o.label}
        </G.Item>
      ))}
    </G.Root>
  );
}

// ---------- Tabs ----------

export const TabsRoot = T.Root;
export const TabsContent = T.Content;

export function TabsList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <T.List aria-label={label} className="flex gap-1 border-b border-border px-2">
      {children}
    </T.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <T.Trigger
      value={value}
      className={cn(
        '-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 border-transparent px-3 text-body font-medium text-text-muted transition-colors',
        'hover:text-text data-[state=active]:border-text data-[state=active]:text-text',
      )}
    >
      {children}
    </T.Trigger>
  );
}

// ---------- Tooltip ----------

export const TooltipProvider = TT.Provider;

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TT.Root delayDuration={200}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg bg-ink-900 px-2.5 py-1.5 text-small text-on-primary shadow-md data-[state=delayed-open]:animate-[rp-fade_var(--rp-motion-fast)_ease-out]"
        >
          {content}
          <TT.Arrow className="fill-ink-900" />
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

// ---------- Dialog (modal) ----------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink-900/45 data-[state=open]:animate-[rp-fade_var(--rp-motion-base)_ease-out]" />
        <D.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
            'rounded-2xl border border-border bg-surface p-5 shadow-overlay sm:p-6 data-[state=open]:animate-[rp-pop_var(--rp-motion-base)_var(--rp-ease)]',
            width === 'sm' ? 'max-w-sm' : width === 'md' ? 'max-w-lg' : 'max-w-2xl',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <D.Title className="text-h2 text-text">{title}</D.Title>
            <D.Close
              aria-label="Close"
              className="-mt-1 -mr-2 inline-flex size-10 items-center justify-center rounded-full text-text-secondary hover:bg-surface-sunken"
            >
              <X aria-hidden className="size-[18px]" strokeWidth={ICON_STROKE} />
            </D.Close>
          </div>
          {description ? (
            <D.Description className="mt-1 text-body text-text-secondary">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ---------- Breadcrumbs ----------

/** Breadcrumb trail (UI plan §3 v2): links for parents, plain text for the current page. */
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-small text-text-muted">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? (
              <span aria-hidden className="text-border-strong">
                /
              </span>
            ) : null}
            {it.to ? (
              <Link to={it.to} className="rounded-sm hover:text-text hover:underline hover:underline-offset-2">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-text-secondary">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
