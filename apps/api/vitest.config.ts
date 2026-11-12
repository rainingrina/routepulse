import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(root, '.env');

// Tests always run against TEST_DATABASE_URL, never the dev database.
if (existsSync(envPath)) process.loadEnvFile(envPath);
const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is not set (see apps/api/.env.example).');
}
if (testDatabaseUrl === process.env['DATABASE_URL']) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL so tests never touch dev data.');
}

export default defineConfig({
  root,
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/globalSetup.ts'],
    // Integration tests share one database: run files one at a time.
    fileParallelism: false,
    // Some integration tests advance the simulation ~20 sim-hours through the real pipeline and take
    // 3–7 s on a busy machine; the 5 s default timed out and cascaded into the next tests (M9).
    testTimeout: 30_000,
    // beforeAll/afterAll reset the demo world (seed + first recalculation); CI runners are slower.
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl,
      DEMO_MODE: 'true',
    },
  },
});
