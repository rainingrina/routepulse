import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../cn';
import { LoaderCircle, ICON_STROKE, type LucideIcon } from '../icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'touch';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed border border-primary shadow-xs disabled:border-border-strong disabled:bg-surface-sunken disabled:text-text-muted disabled:shadow-none',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-subtle hover:border-text-muted active:bg-surface-sunken',
  ghost: 'bg-transparent text-text-secondary border border-transparent hover:bg-surface-sunken hover:text-text',
  danger: 'bg-danger text-on-primary border border-danger hover:opacity-90',
};

// md 36 px, lg 44 px (login), touch 48 px (driver UI, ≥ 48 px targets)
const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small gap-1.5',
  md: 'h-9 px-4 text-body gap-2',
  lg: 'h-11 px-5 text-body gap-2',
  touch: 'min-h-12 px-5 text-body-lg gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap select-none',
        'transition-colors duration-[var(--rp-motion-fast)] disabled:opacity-70',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={ICON_STROKE} />
      ) : Icon ? (
        <Icon aria-hidden className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
      ) : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md' | 'touch';
  /** `dark` on the graphite bar; `outline` for a bordered button on light surfaces. */
  tone?: 'light' | 'dark' | 'outline';
  ref?: Ref<HTMLButtonElement>;
}

const iconTones = {
  light: 'rounded-lg text-text-secondary hover:bg-surface-sunken hover:text-text',
  outline: 'rounded-lg border border-border-strong bg-surface text-text hover:bg-surface-subtle',
  dark: 'rounded-full text-nav-text-strong hover:bg-nav-hover',
} as const;

export function IconButton({ icon: Icon, label, size = 'md', tone = 'light', className, type = 'button', ref, ...rest }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center',
        iconTones[tone],
        'transition-colors duration-[var(--rp-motion-fast)] disabled:opacity-50',
        size === 'sm' ? 'size-8' : size === 'md' ? 'size-9' : 'size-12',
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden className={size === 'touch' ? 'size-6' : 'size-[18px]'} strokeWidth={ICON_STROKE} />
    </button>
  );
}
