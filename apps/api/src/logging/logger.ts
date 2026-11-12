import type { LogLevel } from '../config/env.js';

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/** Single-line JSON logs (architecture §13). Never log secrets, passwords or cookies. */
export function createLogger(level: LogLevel): Logger {
  const write = (severity: 'info' | 'error', event: string, fields?: Record<string, unknown>) => {
    if (level === 'silent') return;
    const line = JSON.stringify({ time: new Date().toISOString(), level: severity, event, ...fields });
    if (severity === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
  return {
    info: (event, fields) => write('info', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
