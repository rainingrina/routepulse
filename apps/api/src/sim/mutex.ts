/**
 * The in-process "world lock" (architecture §9.7). Every simulation mutation — ticker steps, clock
 * controls, reset, driver milestones — runs through `run`, strictly one at a time, in call order.
 *
 * Limitation (documented): this only serialises work inside ONE API process. Running several API
 * instances against the same database is not supported; that would need a database advisory lock
 * or a single simulation worker (architecture §15 scaling path).
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    // Keep the chain alive even if `fn` rejects; callers still receive the rejection.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
