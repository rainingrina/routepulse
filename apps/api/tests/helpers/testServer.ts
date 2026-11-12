import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { createLogger } from '../../src/logging/logger.js';

export const TEST_SESSION_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export interface TestServer {
  baseUrl: string;
  prisma: PrismaClient;
  config: AppConfig;
  close(): Promise<void>;
}

export interface TestServerOptions {
  /** Extra environment overrides (e.g. NODE_ENV=production, DEMO_MODE=false). */
  env?: Record<string, string>;
  /** Injected real-time clock for sessions and rate limits. */
  now?: () => number;
  loginRateLimit?: { limit: number; windowMs: number };
}

/**
 * Starts the real Express app on an ephemeral port against the test database.
 * Tests call it with Node's built-in fetch (no HTTP test library).
 */
export async function startTestServer(opts: TestServerOptions = {}): Promise<TestServer> {
  const config = loadConfig({
    ...process.env,
    SESSION_SECRET: TEST_SESSION_SECRET,
    PORT: '0',
    ...opts.env,
  });
  const prisma = createPrisma(config.databaseUrl);
  const app = createApp({
    config,
    prisma,
    logger: createLogger('silent'),
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.loginRateLimit ? { loginRateLimit: opts.loginRateLimit } : {}),
  });
  const server: Server = await new Promise((resolveServer) => {
    const s = app.listen(0, () => resolveServer(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    prisma,
    config,
    close: async () => {
      await new Promise<void>((resolveClose, reject) =>
        server.close((err) => (err ? reject(err) : resolveClose())),
      );
      await prisma.$disconnect();
    },
  };
}

/** Logs in through the real endpoint and returns the session cookie pair ("rp_session=…"). */
export async function loginCookie(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const pair = setCookie.split(';')[0] ?? '';
  if (!pair.startsWith('rp_session=')) throw new Error('no session cookie');
  return pair;
}
