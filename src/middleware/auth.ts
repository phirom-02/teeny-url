// STUB (Phase 1): replaced during Phase 2. Owner: auth agent.
import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';
import type { AuthenticatedKey } from '../types/express.d.ts';

/** Requires `Authorization: Bearer tny_…`; sets `req.apiKey` or throws 401. */
export const requireApiKey: RequestHandler = () => {
  throw new AppError('UNAUTHORIZED', 'Not implemented');
};

/** The authenticated key for a request that passed `requireApiKey`. */
export function currentKey(req: Request): AuthenticatedKey {
  if (!req.apiKey) throw new AppError('UNAUTHORIZED', 'Missing API key');
  return req.apiKey;
}
