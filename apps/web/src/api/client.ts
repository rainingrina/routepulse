import type { ApiError, ErrorCode, ValidationIssue } from './contract';
import { ERROR_CODES } from './contract';

/** Same-origin base path (06_API_SPEC.md §1). The Vite dev server proxies it to the API. */
export const API_BASE = '/api';

export type ApiFailureKind = 'http' | 'network' | 'invalid-response' | 'unavailable';

/** Thrown for every failed API call. `code` is the server's `error.code` when the envelope was present. */
export class ApiRequestError extends Error {
  readonly kind: ApiFailureKind;
  readonly status: number | null;
  readonly code: ErrorCode | null;
  readonly details: ValidationIssue[] | Record<string, unknown> | null;
  readonly requestId: string | null;

  constructor(init: {
    kind: ApiFailureKind;
    message: string;
    status?: number | null;
    code?: ErrorCode | null;
    details?: ValidationIssue[] | Record<string, unknown> | null;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = 'ApiRequestError';
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.details = init.details ?? null;
    this.requestId = init.requestId ?? null;
  }

  get validationIssues(): ValidationIssue[] {
    return Array.isArray(this.details) ? this.details : [];
  }
}

export function isApiRequestError(e: unknown): e is ApiRequestError {
  return e instanceof ApiRequestError;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Hand-written guard for the error envelope (API §1.1). */
export function isApiErrorEnvelope(v: unknown): v is ApiError {
  if (!isRecord(v) || !isRecord(v.error)) return false;
  const e = v.error;
  return (
    typeof e.code === 'string' &&
    (ERROR_CODES as readonly string[]).includes(e.code) &&
    typeof e.message === 'string' &&
    typeof e.requestId === 'string'
  );
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, string | number | boolean | readonly string[] | undefined>;
  signal?: AbortSignal;
}

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
    else params.append(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Typed fetch. The response type is trusted at this boundary (architecture §8.3).
 * Cookies are sent because the API is same-origin.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!path.startsWith('/')) throw new Error(`API path must start with "/": ${path}`);
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}${buildQuery(options.query)}`, {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiRequestError({ kind: 'network', message: 'Could not reach the RoutePulse server.' });
  }

  const headerRequestId = response.headers.get('X-Request-Id');
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown;
  let parseFailed = false;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parseFailed = true;
    }
  }

  if (!response.ok) {
    if (isApiErrorEnvelope(parsed)) {
      throw new ApiRequestError({
        kind: 'http',
        status: response.status,
        code: parsed.error.code,
        message: parsed.error.message,
        details: parsed.error.details ?? null,
        requestId: parsed.error.requestId,
      });
    }
    throw new ApiRequestError({
      kind: 'http',
      status: response.status,
      message: `The server answered with an unexpected error (HTTP ${response.status}).`,
      requestId: headerRequestId,
    });
  }

  if (parseFailed || text.length === 0) {
    throw new ApiRequestError({
      kind: 'invalid-response',
      status: response.status,
      message: 'The server sent a response that is not valid JSON.',
      requestId: headerRequestId,
    });
  }
  return parsed as T;
}
