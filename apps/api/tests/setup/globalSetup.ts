import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Applies all migrations to the test database once per test run (`prisma migrate deploy`).
 * Vitest's `test.env` only reaches the workers, so this reads TEST_DATABASE_URL explicitly.
 */
export default function setup(): void {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url || !url.includes('test')) {
    throw new Error(`Refusing to migrate a database that does not look like a test database: ${url ?? '(unset)'}`);
  }
  const prismaBin = resolve(process.cwd(), '../../node_modules/.bin/prisma');
  execFileSync(prismaBin, ['migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
