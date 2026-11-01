import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { api } from '#lib/server/api.ts';
import { clearSession, readSession } from '#lib/server/session.ts';
import type { Me } from '#lib/types.ts';

/** Resolves the session cookie to a key via `GET /api/me` before any page or action runs. */
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.apiKey = null;
  event.locals.apiError = null;

  const key = readSession(event);
  if (key) {
    const me = await api<Me>(event, key, '/api/me');
    if (me.ok) {
      event.locals.user = { name: me.data.name, prefix: me.data.prefix };
      event.locals.apiKey = key;
    } else if (me.status === 401) {
      clearSession(event); // revoked or unknown key: treat as signed out
    } else {
      // Pages that need the session turn this into an error page (see requireApiKey). Not
      // thrown here, so /logout and the 404 page keep working while the API is down.
      event.locals.apiError = {
        status: me.status === 429 || me.status === 503 ? me.status : 502,
        message: me.error.message,
      };
    }
  }

  const response = await resolve(event);
  // Pages rendered for a signed-in key contain its links: keep them out of shared caches.
  if (event.locals.user && !response.headers.has('cache-control')) {
    response.headers.set('cache-control', 'private, no-store');
  }
  return response;
};

/** Logs unexpected errors (never request headers) and keeps their details out of the page. */
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== 'unknown') return;
  console.error(`[web] ${event.request.method} ${event.url.pathname} failed:`, error);
  return { message: 'Something went wrong on our side.' };
};
