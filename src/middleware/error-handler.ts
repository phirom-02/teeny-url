// STUB (Phase 1): replaced during Phase 2. Owner: platform agent.
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};
