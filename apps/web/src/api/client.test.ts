import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiRequestError, buildQuery, isApiErrorEnvelope } from './client';

function mockFetch(status: number, body: string | null, headers: Record<string, string> = {}) {
  const fn = vi.fn(async () => new Response(body, { status, headers }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('GETs same-origin /api paths with credentials and returns parsed JSON', async () => {
    const fetchFn = mockFetch(200, JSON.stringify({ status: 'ok' }));
    const data = await apiRequest<{ status: string }>('/health');
    expect(data).toEqual({ status: 'ok' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/health');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('sends a JSON body with Content-Type only when there is a body (API §1: 415 otherwise)', async () => {
    const fetchFn = mockFetch(200, '{}');
    await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.test', password: 'x' } });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.test', password: 'x' }));
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch(204, null);
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns the error envelope into ApiRequestError with code, message, details and requestId', async () => {
    mockFetch(
      400,
      JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some fields are not valid.',
          details: [{ path: 'email', message: 'Required' }],
          requestId: 'req-123',
        },
      }),
    );
    const err = await apiRequest('/auth/login', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    const e = err as ApiRequestError;
    expect(e.kind).toBe('http');
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toBe('Some fields are not valid.');
    expect(e.requestId).toBe('req-123');
    expect(e.validationIssues).toEqual([{ path: 'email', message: 'Required' }]);
  });

  it('handles a non-envelope error body (e.g. proxy 502) without a code, keeping the header request id', async () => {
    mockFetch(502, '<html>Bad gateway</html>', { 'X-Request-Id': 'hdr-9' });
    const e = (await apiRequest('/sync').catch((x: unknown) => x)) as ApiRequestError;
    expect(e.kind).toBe('http');
    expect(e.status).toBe(502);
    expect(e.code).toBeNull();
    expect(e.requestId).toBe('hdr-9');
  });

  it('reports a network failure as kind "network"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const e = (await apiRequest('/sync').catch((x: unknown) => x)) as ApiRequestError;
    expect(e.kind).toBe('network');
    expect(e.status).toBeNull();
  });

  it('rejects a 200 response that is not JSON', async () => {
    mockFetch(200, 'not json');
    const e = (await apiRequest('/sync').catch((x: unknown) => x)) as ApiRequestError;
    expect(e.kind).toBe('invalid-response');
  });

  it('requires paths to start with "/"', async () => {
    await expect(apiRequest('sync')).rejects.toThrow('must start with');
  });
});

describe('isApiErrorEnvelope', () => {
  it('accepts only the documented envelope with a known error code', () => {
    expect(isApiErrorEnvelope({ error: { code: 'NOT_FOUND', message: 'x', requestId: 'r' } })).toBe(true);
    expect(isApiErrorEnvelope({ error: { code: 'TEAPOT', message: 'x', requestId: 'r' } })).toBe(false);
    expect(isApiErrorEnvelope({ error: { code: 'NOT_FOUND', message: 'x' } })).toBe(false);
    expect(isApiErrorEnvelope({ message: 'x' })).toBe(false);
    expect(isApiErrorEnvelope(null)).toBe(false);
  });
});

describe('buildQuery', () => {
  it('repeats array params, skips undefined and encodes values', () => {
    expect(buildQuery({ status: 'live', riskLevel: ['AT_RISK', 'WATCH'], q: undefined, limit: 50 })).toBe(
      '?status=live&riskLevel=AT_RISK&riskLevel=WATCH&limit=50',
    );
    expect(buildQuery({ q: 'SHP 10' })).toBe('?q=SHP+10');
    expect(buildQuery({})).toBe('');
    expect(buildQuery(undefined)).toBe('');
  });
});
