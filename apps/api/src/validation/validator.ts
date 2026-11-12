import type { ValidationIssue } from '@routepulse/shared';
import { ValidationError } from '../errors/domainError.js';

/**
 * Hand-written request validation (architecture §8.2, decision D9 — no schema library).
 *
 * Usage in a controller:
 *   const v = new Validator();
 *   const body = v.object(req.body, 'body', ['email', 'password']);
 *   const email = v.string(body, 'email', { min: 3, max: 254, trim: true, lower: true });
 *   v.assertValid();   // throws one 400 VALIDATION_ERROR with every issue
 *
 * Shape checks only (types, required, lengths, enums, unknown fields). Business rules belong in
 * services. Enum lists should come from Prisma Client's generated enum objects.
 */
export class Validator {
  readonly issues: ValidationIssue[] = [];

  private add(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  /** A plain JSON object with only `allowed` keys. Unknown keys are reported (contract drift). */
  object(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.add(path, 'Must be a JSON object');
      return {};
    }
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) this.add(`${path}.${key}`, 'Unknown field');
    }
    return obj;
  }

  string(
    obj: Record<string, unknown>,
    key: string,
    opts: { min?: number; max: number; trim?: boolean; lower?: boolean; optional?: boolean },
  ): string | undefined {
    const raw = obj[key];
    if (raw === undefined || raw === null) {
      if (!opts.optional) this.add(key, 'Required');
      return undefined;
    }
    if (typeof raw !== 'string') {
      this.add(key, 'Must be a string');
      return undefined;
    }
    let value = opts.trim ? raw.trim() : raw;
    if (opts.lower) value = value.toLowerCase();
    if (value.length < (opts.min ?? 1)) this.add(key, `Must be at least ${opts.min ?? 1} characters`);
    if (value.length > opts.max) this.add(key, `Must be at most ${opts.max} characters`);
    return value;
  }

  email(obj: Record<string, unknown>, key: string): string | undefined {
    const value = this.string(obj, key, { min: 3, max: 254, trim: true, lower: true });
    if (value !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      this.add(key, 'Must be a valid email address');
    }
    return value;
  }

  oneOf<T extends string>(obj: Record<string, unknown>, key: string, allowed: readonly T[], opts: { optional?: boolean } = {}): T | undefined {
    const raw = obj[key];
    if (raw === undefined || raw === null) {
      if (!opts.optional) this.add(key, 'Required');
      return undefined;
    }
    if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
      this.add(key, `Must be one of: ${allowed.join(', ')}`);
      return undefined;
    }
    return raw as T;
  }

  integer(obj: Record<string, unknown>, key: string, opts: { min: number; max: number; multipleOf?: number; optional?: boolean }): number | undefined {
    const raw = obj[key];
    if (raw === undefined || raw === null) {
      if (!opts.optional) this.add(key, 'Required');
      return undefined;
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
      this.add(key, 'Must be an integer');
      return undefined;
    }
    if (raw < opts.min || raw > opts.max) this.add(key, `Must be between ${opts.min} and ${opts.max}`);
    if (opts.multipleOf && raw % opts.multipleOf !== 0) this.add(key, `Must be a multiple of ${opts.multipleOf}`);
    return raw;
  }

  isoDateTime(obj: Record<string, unknown>, key: string, opts: { optional?: boolean } = {}): Date | undefined {
    const raw = obj[key];
    if (raw === undefined || raw === null) {
      if (!opts.optional) this.add(key, 'Required');
      return undefined;
    }
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      this.add(key, 'Must be an ISO 8601 date-time with a time zone');
      return undefined;
    }
    return new Date(raw);
  }

  literalTrue(obj: Record<string, unknown>, key: string): true | undefined {
    if (obj[key] !== true) {
      this.add(key, 'Must be true');
      return undefined;
    }
    return true;
  }

  /** Path parameters: non-empty, ≤ 64 characters, no surprises. Existence is checked by services. */
  pathId(value: unknown, name: string): string | undefined {
    if (typeof value !== 'string' || value.length === 0 || value.length > 64 || !/^[A-Za-z0-9_-]+$/.test(value)) {
      this.add(name, 'Invalid identifier');
      return undefined;
    }
    return value;
  }

  get valid(): boolean {
    return this.issues.length === 0;
  }

  /** Throws one VALIDATION_ERROR carrying every collected issue. */
  assertValid(): void {
    if (!this.valid) throw new ValidationError(this.issues);
  }
}
