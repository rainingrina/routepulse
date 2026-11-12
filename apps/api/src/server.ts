import { createApp, type AppLocals } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import { createPrisma } from './db/prisma.js';
import { createLogger } from './logging/logger.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger(config.logLevel);
  const prisma = createPrisma(config.databaseUrl);
  const app = createApp({ config, prisma, logger });

  const server = app.listen(config.port, () => {
    logger.info('api_started', { port: config.port, nodeEnv: config.nodeEnv, demoMode: config.demoMode });
  });

  const shutdown = (signal: string) => {
    logger.info('api_stopping', { signal });
    (app.locals as AppLocals).simulation.stop();
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
