import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors/domainError.js';
import { Validator } from '../../src/validation/validator.js';

describe('Validator (hand-written, CT-2)', () => {
  it('collects every issue and throws one VALIDATION_ERROR', () => {
    const v = new Validator();
    const body = v.object({ email: 'nope', role: 'COORDINATOR' }, 'body', ['email', 'password']);
    v.email(body, 'email');
    v.string(body, 'password', { max: 128 });
    expect(v.issues).toEqual([
      { path: 'body.role', message: 'Unknown field' },
      { path: 'email', message: 'Must be a valid email address' },
      { path: 'password', message: 'Required' },
    ]);
    expect(() => v.assertValid()).toThrow(ValidationError);
  });

  it('rejects non-objects, arrays and null bodies', () => {
    for (const bad of [null, [], 'x', 3]) {
      const v = new Validator();
      v.object(bad, 'body', []);
      expect(v.valid).toBe(false);
    }
  });

  it('trims and lower-cases emails', () => {
    const v = new Validator();
    expect(v.email({ email: '  Buyer@Kestrel.TEST ' }, 'email')).toBe('buyer@kestrel.test');
    expect(v.valid).toBe(true);
  });

  it('checks string types and lengths', () => {
    const v = new Validator();
    v.string({ a: 5 }, 'a', { max: 3 });
    v.string({ b: 'toolong' }, 'b', { max: 3 });
    v.string({ c: '' }, 'c', { max: 3 });
    v.string({}, 'd', { max: 3, optional: true });
    expect(v.issues.map((i) => i.path)).toEqual(['a', 'b', 'c']);
  });

  it('checks enums against an allowed list', () => {
    const v = new Validator();
    expect(v.oneOf({ r: 'CUSTOMER' }, 'r', ['COORDINATOR', 'CUSTOMER'] as const)).toBe('CUSTOMER');
    v.oneOf({ r: 'ADMIN' }, 'r', ['COORDINATOR', 'CUSTOMER'] as const);
    expect(v.issues).toHaveLength(1);
  });

  it('checks integers, ranges and multiples', () => {
    const v = new Validator();
    v.integer({ n: 7 }, 'n', { min: 5, max: 720, multipleOf: 5 });
    v.integer({ n: 1.5 }, 'n', { min: 0, max: 10 });
    v.integer({ n: 900 }, 'n', { min: 0, max: 720 });
    expect(v.issues).toHaveLength(3);
  });

  it('accepts ISO date-times with a time zone only', () => {
    const v = new Validator();
    expect(v.isoDateTime({ t: '2026-11-19T10:30:00Z' }, 't')?.toISOString()).toBe('2026-11-19T10:30:00.000Z');
    v.isoDateTime({ t: '2026-11-19 10:30' }, 't');
    v.isoDateTime({ t: '2026-11-19T10:30:00' }, 't');
    expect(v.issues).toHaveLength(2);
  });

  it('validates path ids and literal true', () => {
    const v = new Validator();
    expect(v.pathId('shp_1042', 'shipmentId')).toBe('shp_1042');
    v.pathId('../etc/passwd', 'shipmentId');
    v.pathId('x'.repeat(65), 'shipmentId');
    v.literalTrue({ confirm: 'true' }, 'confirm');
    expect(v.issues).toHaveLength(3);
  });
});
