import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';

/** Catch-all for unmatched routes. Also mounted under `/api`, so use the full original path. */
export const notFound: RequestHandler = (req) => {
  const path = req.originalUrl.split('?', 1)[0] ?? req.path;
  throw new AppError('NOT_FOUND', `Route ${req.method} ${path} not found`);
};
