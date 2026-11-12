import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { createLogger } from '../../src/logging/logger.js';

export interface TestServer {
  baseUrl: string;
  prisma: PrismaClient;
  close(): Promise<void>;
}

/**
 * Starts the real Express app on an ephemeral port against the test database.
 * Tests call it with Node's built-in fetch (no HTTP test library).
 */
export async function startTestServer(): Promise<TestServer> {
  const config = loadConfig({
    ...process.env,
    SESSION_SECRET: process.env['SESSION_SECRET'] ?? 'test-secret-that-is-at-least-32-characters-long',
    PORT: '0',
  });
  const prisma = createPrisma(config.databaseUrl);
  const app = createApp({ config, prisma, logger: createLogger('silent') });
  const server: Server = await new Promise((resolveServer) => {
    const s = app.listen(0, () => resolveServer(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    prisma,
    close: async () => {
      await new Promise<void>((resolveClose, reject) =>
        server.close((err) => (err ? reject(err) : resolveClose())),
      );
      await prisma.$disconnect();
    },
  };
}
