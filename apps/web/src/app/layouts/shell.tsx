import { Suspense, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Dialog as D, DropdownMenu as DM } from 'radix-ui';
import { useLogout } from '../../api/hooks/auth';
import { IS_MOCK_MODE } from '../../api/services';
import { useSync } from '../../api/sync';
import { Banner, InlineError } from '../../components/display/feedback';
import { cn } from '../../components/cn';
import { ChevronDown, LogOut, Menu, User, X, ICON_STROKE, type LucideIcon } from '../../components/icons';
import { roleLabel, t } from '../../i18n/en';
import { useCurrentUser } from '../RoleGuard';
import { PageLoading } from '../FullPageLoading';

/**
 * Application frame (UI plan §3, v2): one graphite bar per role with the wordmark, primary
 * navigation (warm-beige pill for the active route), contextual controls and the account menu.
 * Everything that sits on the bar uses the `onDark` variants below.
 */

export function Wordmark({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-h3 font-semibold tracking-tight', inverse ? 'text-nav-text-strong' : 'text-text', className)}>
      <span aria-hidden className={cn('relative flex size-6 items-center justify-center rounded-md', inverse ? 'bg-nav-active' : 'bg-ink-900')}>
        <span className={cn('size-2 rounded-full', inverse ? 'bg-ink-900' : 'bg-accent-fill')} />
        <span className={cn('absolute right-1 bottom-1 size-1 rounded-full', inverse ? 'bg-accent-fill' : 'bg-nav-active')} />
      </span>
      <span>
        Route<span className={inverse ? 'text-sage-muted' : 'text-accent'}>Pulse</span>
      </span>
    </span>
  );
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: ReactNode;
}

/** Primary navigation link on the graphite bar. */
export function TopNavLink({ to, children, icon: Icon, title }: { to: string; children: ReactNode; icon?: LucideIcon; title?: string }) {
  return (
    <NavLink
      to={to}
      title={title}
      className={({ isActive }) =>
        cn(
          'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-body font-medium whitespace-nowrap transition-colors duration-[var(--rp-motion-fast)]',
          isActive ? 'bg-nav-active text-nav-active-text' : 'text-nav-text hover:bg-nav-hover hover:text-nav-text-strong',
        )
      }
    >
      {Icon ? <Icon aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> : null}
      {children}
    </NavLink>
  );
}

/** Below lg the primary navigation moves into a sheet opened from the bar (UI plan §3 responsive). */
export function MobileNav({ items, footer }: { items: NavItem[]; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger
        aria-label="Open navigation"
        className="inline-flex size-10 items-center justify-center rounded-full text-nav-text hover:bg-nav-hover hover:text-nav-text-strong"
      >
        <Menu aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink-900/40 data-[state=open]:animate-[rp-fade_var(--rp-motion-base)_ease-out]" />
        <D.Content className="on-dark fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col bg-nav-bg p-4 shadow-overlay data-[state=open]:animate-[rp-slide-in_var(--rp-motion-base)_var(--rp-ease)]">
          <div className="flex items-center justify-between">
            <Wordmark inverse />
            <D.Close aria-label="Close navigation" className="inline-flex size-10 items-center justify-center rounded-full text-nav-text hover:bg-nav-hover">
              <X aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
            </D.Close>
          </div>
          <D.Title className="sr-only">Navigation</D.Title>
          <D.Description className="sr-only">Main sections</D.Description>
          <nav aria-label="Main" className="mt-6 flex flex-col gap-1">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 items-center gap-3 rounded-xl px-3 text-body-lg font-medium',
                    isActive ? 'bg-nav-active text-nav-active-text' : 'text-nav-text hover:bg-nav-hover hover:text-nav-text-strong',
                  )
                }
              >
                <it.icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
                <span className="flex-1">{it.label}</span>
                {it.badge}
              </NavLink>
            ))}
          </nav>
          {footer ? <div className="mt-auto border-t border-nav-border pt-4">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Name, role and Log out (UI plan §3). */
export function UserMenu({ onDark = false }: { onDark?: boolean }) {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <InlineError error={logout.error} className="max-w-48" />
      <DM.Root>
        <DM.Trigger
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-full pr-2 pl-1 text-body',
            onDark ? 'text-nav-text-strong hover:bg-nav-hover' : 'text-text hover:bg-surface-sunken',
          )}
          aria-label={`Account menu for ${user.name}`}
        >
          <span
            aria-hidden
            className={cn(
              'flex size-8 items-center justify-center rounded-full text-small font-semibold',
              onDark ? 'bg-nav-active text-nav-active-text' : 'bg-primary-subtle text-text',
            )}
          >
            {initials || <User className="size-4" strokeWidth={ICON_STROKE} />}
          </span>
          <span className="hidden min-w-0 flex-col items-start leading-tight lg:flex">
            <span className="max-w-36 truncate font-medium">{user.name}</span>
            <span className={cn('text-small', onDark ? 'text-nav-text' : 'text-text-muted')}>{roleLabel[user.role]}</span>
          </span>
          <ChevronDown aria-hidden className={cn('size-4', onDark ? 'text-nav-text' : 'text-text-muted')} strokeWidth={ICON_STROKE} />
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={8} className="z-50 min-w-60 rounded-xl border border-border bg-surface p-1.5 shadow-md">
            <div className="px-3 py-2">
              <p className="text-body font-medium text-text">{user.name}</p>
              <p className="text-small text-text-muted">
                {roleLabel[user.role]}
                {user.customer ? ` · ${user.customer.name}` : ''}
                {user.transporter ? ` · ${user.transporter.name}` : ''}
              </p>
            </div>
            <DM.Separator className="my-1 h-px bg-border" />
            <DM.Item
              disabled={logout.isPending}
              onSelect={() => logout.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) })}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-body text-text outline-none data-[highlighted]:bg-surface-sunken"
            >
              <LogOut aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
              {t.nav.logout}
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
    </div>
  );
}

export function MockModeBanner() {
  if (!IS_MOCK_MODE) return null;
  return <div className="border-b border-accent/30 bg-accent-subtle px-4 py-1.5 text-center text-small font-medium text-accent">{t.mockBanner}</div>;
}

/** Thin context line under the bar: fictional data, rule-based estimates, time zone (always visible). */
export function ContextStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('border-b border-border bg-surface-subtle px-4 py-1 text-small text-text-muted xl:px-6', className)}>{children}</p>;
}

/** Reconnecting and simulation-error banners (UI plan §6.6, §15). */
export function SyncBanners() {
  const { sync, reconnecting } = useSync();
  if (!reconnecting && !sync?.simError) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {reconnecting ? (
        <Banner tone="warning" live>
          {t.states.reconnecting}
        </Banner>
      ) : null}
      {sync?.simError ? (
        <Banner tone="warning" live>
          {t.sim.error(sync.simError)}
        </Banner>
      ) : null}
    </div>
  );
}

export function LayoutOutlet() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Outlet />
    </Suspense>
  );
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-60 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md"
    >
      Skip to content
    </a>
  );
}
