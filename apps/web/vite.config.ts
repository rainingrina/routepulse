import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// API on :4000 (architecture §15). Same-origin proxy keeps the rp_session cookie and CSP `connect-src 'self'`.
// ROUTEPULSE_API_ORIGIN overrides it (e.g. a second API on another port for an isolated test run).
const API_ORIGIN = process.env['ROUTEPULSE_API_ORIGIN'] ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': API_ORIGIN,
      '/tiles': API_ORIGIN,
      '/glyphs': API_ORIGIN,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
