import { type Options, rateLimit } from 'express-rate-limit';
import { env } from '../env.ts';
import { AppError } from '../lib/errors.ts';

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 120;
export const REDIRECT_RATE_LIMIT_MAX = 300;

const shared: Partial<Options> = {
  windowMs: RATE_LIMIT_WINDOW_MS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, _res, next) => {
    next(new AppError('RATE_LIMITED', 'Too many requests — please slow down'));
  },
};

/** Per-client-IP limit for `/api/*`. Sends IETF draft-8 `RateLimit` headers (+ `Retry-After` on 429). */
export const apiRateLimit = rateLimit({ ...shared, limit: RATE_LIMIT_MAX });

/** Looser per-IP limit for public redirects: each one is a DB write, so cap click inflation. */
export const redirectRateLimit = rateLimit({ ...shared, limit: REDIRECT_RATE_LIMIT_MAX });
