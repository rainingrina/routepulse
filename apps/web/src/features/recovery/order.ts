import type { RecoveryOptionDto } from '../../api/contract';

/**
 * Display order from UI plan §9.1: Suggested → other feasible (meets promise first, then by cost) →
 * NEW_WINDOW → NOTIFY_ONLY → infeasible. Ordering only; the API decides feasibility and the suggestion.
 */
function group(o: RecoveryOptionDto): number {
  if (!o.feasible) return 4;
  if (o.isSuggested) return 0;
  if (o.kind === 'NEW_WINDOW') return 2;
  if (o.kind === 'NOTIFY_ONLY') return 3;
  return 1;
}

export function orderOptions(options: RecoveryOptionDto[]): RecoveryOptionDto[] {
  return [...options].sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    if (group(a) === 1) {
      if (a.meetsPromise !== b.meetsPromise) return a.meetsPromise ? -1 : 1;
      return a.extraCostInr - b.extraCostInr;
    }
    return 0;
  });
}

/** A chosen (or awaiting-customer) option exists, so no further choice is offered. */
export function decisionMade(options: RecoveryOptionDto[]): RecoveryOptionDto | null {
  return options.find((o) => o.status === 'CHOSEN' || o.status === 'AWAITING_CUSTOMER') ?? null;
}
