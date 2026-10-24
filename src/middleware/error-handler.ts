import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';
import type { ErrorResponse } from '../schemas/common.ts';

/** API-wide shape of `details` on a `VALIDATION_ERROR`. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Maps errors that are the client's fault onto an `AppError`. Returns `null` for anything
 * unexpected, which becomes a logged 500.
 */
function toClientError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const details: ValidationIssue[] = err.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return new AppError('VALIDATION_ERROR', 'Invalid request', details);
  }

  if (typeof err !== 'object' || err === null) return null;
  const { type, status } = err as { type?: unknown; status?: unknown };

  // body-parser (express.json)
  if (type === 'entity.parse.failed') {
    return new AppError('VALIDATION_ERROR', 'Malformed JSON body');
  }
  if (type === 'entity.too.large') {
    return new AppError('PAYLOAD_TOO_LARGE', 'Request body too large');
  }

  // Any other HTTP 4xx raised by Express or body-parser (unsupported charset, undecodable
  // path parameter, …). Use a fixed message so nothing internal is echoed back.
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new AppError('VALIDATION_ERROR', 'Invalid request');
  }

  return null;
}

/** The single place errors become responses: `{ error: { code, message, details? } }`. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const clientError = toClientError(err);
  if (clientError) {
    const body: ErrorResponse = {
      error: {
        code: clientError.code,
        message: clientError.message,
        ...(clientError.details !== undefined && { details: clientError.details }),
      },
    };
    res.status(clientError.status).json(body);
    return;
  }

  (req.log ?? logger).error({ err }, 'Unhandled error');
  const body: ErrorResponse = {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  };
  res.status(500).json(body);
};
