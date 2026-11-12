import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './client';
import { isSessionExpiry, isWorldStateKey, qk, shouldRetryQuery } from './queryClient';

const http = (status: number) => new ApiRequestError({ kind: 'http', status, message: 'x' });

describe('shouldRetryQuery (architecture §13: GET retried twice, 4xx never)', () => {
  it('retries network and 5xx failures at most twice', () => {
    const net = new ApiRequestError({ kind: 'network', message: 'x' });
    expect(shouldRetryQuery(0, net)).toBe(true);
    expect(shouldRetryQuery(1, net)).toBe(true);
    expect(shouldRetryQuery(2, net)).toBe(false);
    expect(shouldRetryQuery(0, http(500))).toBe(true);
  });

  it('never retries 4xx or mock-unavailable errors', () => {
    expect(shouldRetryQuery(0, http(404))).toBe(false);
    expect(shouldRetryQuery(0, http(401))).toBe(false);
    expect(shouldRetryQuery(0, http(409))).toBe(false);
    expect(shouldRetryQuery(0, new ApiRequestError({ kind: 'unavailable', message: 'x' }))).toBe(false);
  });
});

describe('isSessionExpiry', () => {
  it('treats a 401 as session expiry except on auth probes (me/login/logout)', () => {
    expect(isSessionExpiry(http(401), undefined)).toBe(true);
    expect(isSessionExpiry(http(401), { authProbe: true })).toBe(false);
    expect(isSessionExpiry(http(403), undefined)).toBe(false);
    expect(isSessionExpiry(new Error('x'), undefined)).toBe(false);
  });
});

describe('isWorldStateKey (API §15 refetch rules)', () => {
  it('invalidates world state but not me, sync or rules', () => {
    expect(isWorldStateKey(qk.shipments({ status: 'live' }))).toBe(true);
    expect(isWorldStateKey(qk.positions)).toBe(true);
    expect(isWorldStateKey(qk.recoveryOptions('x'))).toBe(true);
    expect(isWorldStateKey(qk.me)).toBe(false);
    expect(isWorldStateKey(qk.sync)).toBe(false);
    expect(isWorldStateKey(qk.rules)).toBe(false);
  });
});
