import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    /** Server-generated id for this request; echoed in X-Request-Id and in error bodies. */
    requestId: string;
  }
}

/**
 * Assigns a fresh request id. A client-supplied X-Request-Id is deliberately ignored so log
 * lines cannot be spoofed or collided.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
