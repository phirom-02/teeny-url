import { rateLimit } from 'express-rate-limit';
import { env } from '../env.ts';
import { AppError } from '../lib/errors.ts';

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 120;

/** Per-client-IP limit for `/api/*`. Sends IETF draft-8 `RateLimit` headers (+ `Retry-After` on 429). */
export const apiRateLimit = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, _res, next) => {
    next(new AppError('RATE_LIMITED', 'Too many requests — please slow down'));
  },
});
