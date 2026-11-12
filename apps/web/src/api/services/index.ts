import { httpApi } from './http';
import type { RoutePulseApi } from './types';

export type { RoutePulseApi } from './types';

/** `vite --mode mock` (script `dev:mock`) uses the in-browser development mock. Every other mode uses the real API. */
export const IS_MOCK_MODE = import.meta.env.MODE === 'mock';

let active: RoutePulseApi = httpApi;

/** Called once at start-up (main.tsx). In non-mock builds the mock module is never loaded. */
export async function initApi(): Promise<void> {
  if (IS_MOCK_MODE) {
    const { createMockApi } = await import('../../mocks/mockApi');
    active = createMockApi();
  }
}

export function api(): RoutePulseApi {
  return active;
}

/** Tests only. */
export function setApiForTests(impl: RoutePulseApi): void {
  active = impl;
}
