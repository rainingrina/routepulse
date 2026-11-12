import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../errors/domainError.js';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hasBody(req: Request): boolean {
  const length = req.headers['content-length'];
  if (length !== undefined) return Number(length) > 0;
  return req.headers['transfer-encoding'] !== undefined;
}

/**
 * Requests that carry a body must be JSON (API §1, architecture §14 CSRF note).
 * Anything else is rejected with 415 before the body parser runs.
 */
export function jsonOnly(req: Request, _res: Response, next: NextFunction): void {
  if (BODY_METHODS.has(req.method) && hasBody(req) && !req.is('application/json')) {
    next(new DomainError('UNSUPPORTED_MEDIA', 'Request bodies must be sent as application/json.'));
    return;
  }
  next();
}
