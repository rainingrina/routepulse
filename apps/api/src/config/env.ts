import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Environment configuration, validated by hand at startup (no schema library, decision D9).
 * The process fails fast with a clear message when a required value is missing or invalid.
 */

export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'info' | 'silent';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  demoMode: boolean;
  logLevel: LogLevel;
  /** Needed by the demo reset (re-seeds demo accounts). Optional otherwise. */
  seedDemoPassword: string | null;
  /**
   * Folder with the offline basemap (`western-india.pmtiles`, created by `npm run basemap:fetch`),
   * served same-origin at /tiles (architecture §16). The app runs without it (fallback style).
   */
  basemapDir: string;
}

/** Default basemap folder: apps/api/static/basemap (outside Git; see .gitignore). */
export const DEFAULT_BASEMAP_DIR = fileURLToPath(new URL('../../static/basemap', import.meta.url));

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];
const LOG_LEVELS: readonly LogLevel[] = ['info', 'silent'];
export const MIN_SECRET_LENGTH = 32;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];

  const nodeEnvRaw = env['NODE_ENV'] ?? 'development';
  const nodeEnv = (NODE_ENVS as readonly string[]).includes(nodeEnvRaw)
    ? (nodeEnvRaw as NodeEnv)
    : (problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`), 'development' as const);

  const portRaw = env['PORT'] ?? '4000';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    problems.push('PORT must be an integer between 0 and 65535');
  }

  const databaseUrl = env['DATABASE_URL'] ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must be a postgresql:// connection string');
  }

  const sessionSecret = env['SESSION_SECRET'] ?? '';
  if (sessionSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  const demoRaw = env['DEMO_MODE'] ?? 'false';
  if (demoRaw !== 'true' && demoRaw !== 'false') {
    problems.push('DEMO_MODE must be "true" or "false"');
  }

  const logRaw = env['LOG_LEVEL'] ?? (nodeEnv === 'test' ? 'silent' : 'info');
  const logLevel = (LOG_LEVELS as readonly string[]).includes(logRaw)
    ? (logRaw as LogLevel)
    : (problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`), 'info' as const);

  const seedRaw = env['SEED_DEMO_PASSWORD'];
  if (seedRaw !== undefined && seedRaw.length > 0 && seedRaw.length < 12) {
    problems.push('SEED_DEMO_PASSWORD must be at least 12 characters when set');
  }

  const basemapRaw = env['BASEMAP_DIR'];
  if (basemapRaw !== undefined && basemapRaw.length > 0 && !isAbsolute(basemapRaw)) {
    problems.push('BASEMAP_DIR must be an absolute path when set');
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    nodeEnv,
    port,
    databaseUrl,
    sessionSecret,
    demoMode: demoRaw === 'true',
    logLevel,
    seedDemoPassword: seedRaw && seedRaw.length > 0 ? seedRaw : null,
    basemapDir: basemapRaw && basemapRaw.length > 0 ? basemapRaw : DEFAULT_BASEMAP_DIR,
  };
}
