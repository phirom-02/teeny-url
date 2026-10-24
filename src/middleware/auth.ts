import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';
import { authenticate } from '../services/api-keys.service.ts';
import type { AuthenticatedKey } from '../types/express.d.ts';

/** Extracts the token from `Bearer <token>` (scheme case-insensitive, exactly one token). */
function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Requires `Authorization: Bearer tny_…`; sets `req.apiKey` or throws 401. Never logs the token. */
export const requireApiKey: RequestHandler = async (req, res, next) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    res.set('WWW-Authenticate', 'Bearer');
    throw new AppError('UNAUTHORIZED', 'Missing API key. Send "Authorization: Bearer <key>".');
  }

  const key = await authenticate(token);
  if (!key) {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    throw new AppError('UNAUTHORIZED', 'Invalid or revoked API key');
  }

  req.apiKey = key;
  next();
};

/** The authenticated key for a request that passed `requireApiKey`. */
export function currentKey(req: Request): AuthenticatedKey {
  if (!req.apiKey) throw new AppError('UNAUTHORIZED', 'Missing API key');
  return req.apiKey;
}
