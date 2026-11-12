import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../logging/logger.js';

/** One log line per request with id, route, status and duration. */
export function requestLog(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info('request', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(ms * 10) / 10,
      });
    });
    next();
  };
}
