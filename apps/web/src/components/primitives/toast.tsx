import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Toast as T } from 'radix-ui';
import { cn } from '../cn';
import { CircleCheck, CircleAlert, TriangleAlert, X, ICON_STROKE } from '../icons';

/**
 * Toasts (UI plan §15 v2): short confirmation of an action the server has accepted, or an action
 * error. Never a fake success — callers raise a toast from a mutation's onSuccess / onError.
 * Radix Toast (part of the approved `radix-ui` package) handles timing, focus and announcements.
 */

export type ToastTone = 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  /** Read by screen readers when the toast is announced (Radix requirement). */
  altText: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: ToastAction;
  duration?: number;
}

interface ToastApi {
  toast: (t: { title: string; description?: string; tone?: ToastTone; action?: ToastAction; duration?: number }) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback<ToastApi['toast']>(({ title, description, tone = 'success', action, duration }) => {
    const id = nextId++;
    setItems((list) => [...list.slice(-2), { id, title, tone, ...(description ? { description } : {}), ...(action ? { action } : {}), ...(duration ? { duration } : {}) }]);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={api}>
      <T.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((it) => (
          <T.Root
            key={it.id}
            type={it.tone === 'error' ? 'foreground' : 'background'}
            {...(it.duration ? { duration: it.duration } : {})}
            onOpenChange={(open) => {
              if (!open) setItems((list) => list.filter((x) => x.id !== it.id));
            }}
            className={cn(
              'flex items-start gap-3 rounded-xl border bg-surface p-3 pr-2 shadow-overlay data-[state=open]:animate-[rp-rise_var(--rp-motion-base)_var(--rp-ease)]',
              it.tone === 'error' || it.tone === 'warning' ? 'border-danger/40' : 'border-border',
            )}
          >
            {it.tone === 'error' ? (
              <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={ICON_STROKE} />
            ) : it.tone === 'warning' ? (
              <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={ICON_STROKE} />
            ) : (
              <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={ICON_STROKE} />
            )}
            <div className="min-w-0 flex-1">
              <T.Title className="text-body font-semibold text-text">{it.title}</T.Title>
              {it.description ? <T.Description className="mt-0.5 text-small text-text-secondary">{it.description}</T.Description> : null}
              {it.action ? (
                <T.Action
                  altText={it.action.altText}
                  onClick={it.action.onClick}
                  className="mt-2 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-small font-medium text-on-primary hover:bg-primary-hover"
                >
                  {it.action.label}
                </T.Action>
              ) : null}
            </div>
            <T.Close aria-label="Dismiss" className="inline-flex size-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-sunken">
              <X aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
            </T.Close>
          </T.Root>
        ))}
        <T.Viewport className="fixed right-3 bottom-3 z-[60] flex w-[360px] max-w-[calc(100vw-24px)] flex-col gap-2 outline-none" />
      </T.Provider>
    </ToastContext.Provider>
  );
}
