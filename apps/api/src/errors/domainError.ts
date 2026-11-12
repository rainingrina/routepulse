import type { ErrorCode, ValidationIssue } from '@routepulse/shared';

/** HTTP status for every error code (architecture §13, API §1.1). */
export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  DEMO_MODE_OFF: 403,
  NOT_FOUND: 404,
  UNSUPPORTED_MEDIA: 415,
  INVALID_TRANSITION: 409,
  STALE_OPTIONS: 409,
  ALREADY_DONE: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/**
 * The one error type domain code throws. The error middleware turns it into the envelope
 * `{ error: { code, message, details?, requestId } }`. `message` must be plain English and safe
 * to show to users.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ValidationIssue[] | Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export class ValidationError extends DomainError {
  constructor(issues: ValidationIssue[], message = 'The request is not valid.') {
    super('VALIDATION_ERROR', message, issues);
    this.name = 'ValidationError';
  }
}

export const notFound = (message = 'This item is not available.') =>
  new DomainError('NOT_FOUND', message);
