import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('../..', import.meta.url));
const prismaCli = resolve(apiDir, '../../node_modules/prisma/build/index.js');

/**
 * Applies all migrations to the test database once per test run (`prisma migrate deploy`).
 * Vitest's `test.env` only reaches the workers, so this reads TEST_DATABASE_URL explicitly.
 */
export default function setup(): void {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set; refusing to migrate.');
  }

  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName.includes('test')) {
    throw new Error(`Refusing to migrate a database that does not look like a test database: ${databaseName || '(unset)'}`);
  }

  process.stdout.write(
    `[test setup] applying migrations to database "${databaseName}" at ${parsed.hostname}:${parsed.port || '5432'}\n`,
  );
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
