import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShipmentListItemCoordinator } from '../../api/contract';
import { useToast } from '../../components/primitives/toast';
import { newlyAtRisk } from './listFilters';

/** UI plan §6.6: at most one at-risk announcement per 5 s. */
export const AT_RISK_TOAST_COOLDOWN_MS = 5000;

/** Toast text for shipments that just turned AT_RISK (one toast per batch). Pure; exported for tests. */
export function atRiskToastContent(items: { id: string; code: string }[]): { title: string; description: string; singleId: string | null } {
  if (items.length === 1) {
    return { title: `${items[0]!.code} is at risk`, description: 'Rule-based estimate now misses the promised time.', singleId: items[0]!.id };
  }
  return { title: `${items.length} shipments are at risk`, description: items.map((i) => i.code).join(', '), singleId: null };
}

/**
 * The control tower's reaction when shipments turn AT_RISK (UI plan §6.6). Source of truth is the
 * server's risk level in the shipment list (#14): a transition is a shipment seen before at another
 * level and now AT_RISK — the first load never notifies, and repeated polls of the same state never
 * repeat. This is not a second alert system: alerts (#26) are unchanged; this only surfaces the
 * transition the coordinator would otherwise have to spot in the list.
 *
 * Returns the ids to pulse once (600 ms). Toasts are batched: transitions inside the cooldown are
 * merged into the next toast. Radix Toast announces it politely, so no separate live region is used.
 */
export function useAtRiskNotifications(
  items: ShipmentListItemCoordinator[],
  ready: boolean,
  actions: { viewOptions: (id: string) => void; showAtRisk: () => void },
): Set<string> {
  const { toast } = useToast();
  const prev = useRef<Map<string, ShipmentListItemCoordinator['riskLevel']> | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(() => new Set());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(new Map<string, string>());
  const lastShownAt = useRef(Number.NEGATIVE_INFINITY);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  const flush = useCallback(() => {
    flushTimer.current = null;
    const batch = [...pending.current].map(([id, code]) => ({ id, code }));
    pending.current.clear();
    if (batch.length === 0) return;
    lastShownAt.current = Date.now();
    const c = atRiskToastContent(batch);
    const singleId = c.singleId;
    toast({
      tone: 'warning',
      title: c.title,
      description: c.description,
      duration: 8000,
      action: singleId
        ? { label: 'View options', altText: `View recovery options for ${batch[0]!.code}`, onClick: () => actionsRef.current.viewOptions(singleId) }
        : { label: 'Show at-risk shipments', altText: 'Filter the list to at-risk shipments', onClick: () => actionsRef.current.showAtRisk() },
    });
  }, [toast]);

  useEffect(() => {
    if (!ready) return;
    const turned = newlyAtRisk(prev.current, items);
    prev.current = new Map(items.map((s) => [s.id, s.riskLevel]));
    if (turned.length === 0) return;
    // The pulse timer lives in a ref: a refetch inside 600 ms must not cancel it (the row would keep pulsing).
    setHighlight(new Set(turned.map((s) => s.id)));
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(new Set()), 600);
    for (const s of turned) pending.current.set(s.id, s.code);
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(flush, Math.max(0, lastShownAt.current + AT_RISK_TOAST_COOLDOWN_MS - Date.now()));
  }, [items, ready, flush]);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    [],
  );
  return highlight;
}
