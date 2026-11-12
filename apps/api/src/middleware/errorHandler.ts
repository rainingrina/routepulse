import type { ApiError } from '@routepulse/shared';
import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../errors/domainError.js';
import type { Logger } from '../logging/logger.js';

/** Errors raised by express.json() carry a `type` and an HTTP `status`. */
interface BodyParserError {
  type: string;
  status?: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return typeof err === 'object' && err !== null && typeof (err as { type?: unknown }).type === 'string';
}

function toDomainError(err: unknown): DomainError | null {
  if (err instanceof DomainError) return err;
  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new DomainError('VALIDATION_ERROR', 'The request body is not valid JSON.', [
        { path: 'body', message: 'Malformed JSON' },
      ]);
    }
    if (err.type === 'entity.too.large') {
      return new DomainError('VALIDATION_ERROR', 'The request body is too large.', [
        { path: 'body', message: 'Body exceeds the 100 kB limit' },
      ]);
    }
  }
  return null;
}

/** Final error middleware: one envelope for every error, no stack traces in responses. */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const known = toDomainError(err);
    const domain = known ?? new DomainError('INTERNAL', 'Something went wrong. Please try again.');

    if (!known) {
      logger.error('unhandled_error', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
      });
    }

    const body: ApiError = {
      error: {
        code: domain.code,
        message: domain.message,
        ...(domain.details !== undefined ? { details: domain.details } : {}),
        requestId: req.requestId,
      },
    };
    res.status(domain.status).json(body);
  };
}

/** 404 for any /api path that no route handled. */
export function apiNotFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new DomainError('NOT_FOUND', 'No such endpoint.'));
}
