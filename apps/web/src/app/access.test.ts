import { describe, expect, it } from 'vitest';
import type { UserDto } from '../api/contract';
import { decideAccess, HOME_PATH } from './access';

const user = (role: UserDto['role']): UserDto => ({
  id: 'u1',
  name: 'Test',
  email: 't@x.test',
  role,
  customer: role === 'CUSTOMER' ? { id: 'c1', name: 'C' } : null,
  transporter: role === 'DRIVER' ? { id: 't1', name: 'T' } : null,
});

describe('decideAccess (role guard)', () => {
  it('sends signed-out users to login', () => {
    expect(decideAccess(null, 'COORDINATOR')).toEqual({ kind: 'login' });
  });

  it('allows the matching role', () => {
    expect(decideAccess(user('COORDINATOR'), 'COORDINATOR')).toEqual({ kind: 'allow' });
    expect(decideAccess(user('CUSTOMER'), 'CUSTOMER')).toEqual({ kind: 'allow' });
    expect(decideAccess(user('DRIVER'), 'DRIVER')).toEqual({ kind: 'allow' });
  });

  it("redirects other roles to their own home, never into another role's tree", () => {
    expect(decideAccess(user('CUSTOMER'), 'COORDINATOR')).toEqual({ kind: 'redirect', to: '/orders' });
    expect(decideAccess(user('DRIVER'), 'CUSTOMER')).toEqual({ kind: 'redirect', to: '/trip' });
    expect(decideAccess(user('COORDINATOR'), 'DRIVER')).toEqual({ kind: 'redirect', to: '/control-tower' });
  });

  it('uses the home paths from API §4.1 LoginResponse.homePath', () => {
    expect(HOME_PATH).toEqual({ COORDINATOR: '/control-tower', CUSTOMER: '/orders', DRIVER: '/trip' });
  });
});
