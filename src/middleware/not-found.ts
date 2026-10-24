import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';

/** Catch-all for unmatched routes; mounted after every router. */
export const notFound: RequestHandler = (req) => {
  throw new AppError('NOT_FOUND', `Route ${req.method} ${req.path} not found`);
};
