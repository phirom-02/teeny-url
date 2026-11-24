import type { Request, Response } from 'express';
import { AppError } from './errors.ts';

/** Name of the httpOnly cookie that holds the browser UI's API key session. */
export const SESSION_COOKIE = 'teeny_key';

/** Session lifetime in seconds (30 days). */
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

function baseCookieOptions(req: Request) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: req.secure,
  };
}

/** Reads a named cookie from a raw `Cookie` header without external middleware. */
export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function setSessionCookie(req: Request, res: Response, key: string): void {
  res.cookie(SESSION_COOKIE, key, {
    ...baseCookieOptions(req),
    maxAge: SESSION_MAX_AGE_S * 1000,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseCookieOptions(req));
}

/**
 * Enforces same-origin `Origin` on cookie-authenticated mutations and session endpoints to
 * prevent cross-site request forgery (CSRF). Respects Express `trust proxy` via `req.secure`.
 */
export function assertSameOrigin(req: Request): void {
  const originHeader = req.get('origin');
  const host = req.get('host');
  if (!originHeader || !host) {
    throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
  }

  const parsedOrigin = URL.parse(originHeader);
  const expectedOrigin = `${req.secure ? 'https' : 'http'}://${host}`;
  if (!parsedOrigin || parsedOrigin.origin !== expectedOrigin) {
    throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
  }
}
