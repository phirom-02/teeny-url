import type { Request, RequestHandler } from 'express';
import {
  assertSameOrigin,
  clearSessionCookie,
  parseCookie,
  SESSION_COOKIE,
} from '../lib/cookies.ts';
import { AppError } from '../lib/errors.ts';
import { authenticate } from '../services/api-keys.service.ts';
import type { AuthenticatedKey } from '../types/express.d.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Extracts the token from `Bearer <token>` (scheme case-insensitive, exactly one token). */
function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Authenticates a request via `Authorization: Bearer tny_…` (API clients) or the `httpOnly`
 * `teeny_key` session cookie (browser UI). Cookie-authenticated mutations require a same-origin
 * `Origin` header (CSRF protection). Sets `req.apiKey` or throws 401/403. Never logs the token.
 */
export const requireApiKey: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== undefined) {
    const token = parseBearerToken(authHeader);
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
    res.set('Cache-Control', 'private, no-store');
    next();
    return;
  }

  const cookieToken = parseCookie(req.headers.cookie, SESSION_COOKIE);
  if (cookieToken !== null) {
    if (!SAFE_METHODS.has(req.method)) {
      assertSameOrigin(req);
    }

    const key = await authenticate(cookieToken);
    if (!key) {
      clearSessionCookie(req, res);
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      throw new AppError('UNAUTHORIZED', 'Invalid or revoked API key');
    }

    req.apiKey = key;
    res.set('Cache-Control', 'private, no-store');
    next();
    return;
  }

  res.set('WWW-Authenticate', 'Bearer');
  throw new AppError('UNAUTHORIZED', 'Missing API key. Send "Authorization: Bearer <key>".');
};

/** The authenticated key for a request that passed `requireApiKey`. */
export function currentKey(req: Request): AuthenticatedKey {
  if (!req.apiKey) throw new AppError('UNAUTHORIZED', 'Missing API key');
  return req.apiKey;
}
