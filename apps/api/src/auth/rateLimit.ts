/**
 * Fixed-window login rate limit per client IP (architecture §7.1: 10 attempts per minute).
 * In memory, no dependency; valid because the API is a single process. Counts every attempt
 * (successful or not) so the limit cannot be probed.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt; returns false when the key is over the limit. */
  attempt(key: string, nowMs: number): boolean {
    const since = nowMs - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return true;
  }
}

export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;
