/** Primitive aliases and the error envelope (06_API_SPEC.md §1.1, §2.1). */

export type Id = string;
/** ISO 8601 UTC timestamp string, simulation time unless stated otherwise. */
export type ISODateTime = string;
/** Integer minutes. */
export type Minutes = number;
/** Percentage 0–100 with one decimal, or null when the denominator is 0. */
export type Pct = number | null;

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'DEMO_MODE_OFF',
  'NOT_FOUND',
  'UNSUPPORTED_MEDIA',
  'INVALID_TRANSITION',
  'STALE_OPTIONS',
  'ALREADY_DONE',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ApiError {
  error: {
    code: ErrorCode;
    /** Plain English, safe to show to the user. */
    message: string;
    details?: ValidationIssue[] | Record<string, unknown>;
    requestId: string;
  };
}

/** Every list endpoint returns this shape (plus extras where documented). */
export interface ListResponse<T> {
  items: T[];
}
