import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Load apps/api/.env with Node's built-in loader (no dotenv dependency).
// An already-set DATABASE_URL (e.g. the test runner pointing at routepulse_test) wins.
if (existsSync('.env')) {
  const preset = process.env['DATABASE_URL'];
  process.loadEnvFile('.env');
  if (preset) process.env['DATABASE_URL'] = preset;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
