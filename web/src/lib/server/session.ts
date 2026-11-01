import type { Cookies } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';

/** The session is the API key itself, kept in an httpOnly cookie the browser's JS can't read. */
export const SESSION_COOKIE = 'teeny_key';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

interface SessionEvent {
  cookies: Cookies;
  url: URL;
}

function cookieOptions(event: SessionEvent) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: event.url.protocol === 'https:',
  } as const;
}

/**
 * Cheap sanity check before a value goes into an `Authorization` header: visible ASCII only (a
 * stray newline or non-ASCII character would make `fetch` throw), and a sane length. Whether the
 * key is actually valid is up to the API.
 */
export function isPlausibleKey(value: string): boolean {
  return /^[\x21-\x7e]{1,256}$/.test(value);
}

/** The API key from the session cookie, or `null`. Malformed cookies are deleted. */
export function readSession(event: SessionEvent): string | null {
  const key = event.cookies.get(SESSION_COOKIE);
  if (key === undefined) return null;
  if (isPlausibleKey(key)) return key;
  clearSession(event);
  return null;
}

export function setSession(event: SessionEvent, key: string): void {
  event.cookies.set(SESSION_COOKIE, key, { ...cookieOptions(event), maxAge: THIRTY_DAYS });
}

export function clearSession(event: SessionEvent): void {
  event.cookies.delete(SESSION_COOKIE, cookieOptions(event));
}

/**
 * For pages that need a signed-in key: shows the error page when the session couldn't be checked
 * (API down or rate limited), redirects to /login when signed out, otherwise returns the key.
 */
export function requireApiKey(locals: App.Locals): string {
  if (locals.apiError) error(locals.apiError.status, locals.apiError.message);
  if (!locals.apiKey) redirect(303, '/login');
  return locals.apiKey;
}
