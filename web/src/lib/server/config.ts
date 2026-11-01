import { dev } from '$app/env';
import { API_ORIGIN } from '$app/env/private';

/**
 * The interactive API reference. In production Express serves `/docs` on the UI's own origin;
 * under `vite dev` (port 5173) it lives on the separately running API.
 */
export function docsUrl(): string {
  return dev ? `${API_ORIGIN}/docs` : '/docs';
}

/**
 * Host the short links live on, shown as the alias prefix (e.g. `localhost:3000/`). In production
 * the API and UI share one origin; in dev the links point at the API (its BASE_URL).
 */
export function shortLinkHost(url: URL): string {
  return dev ? new URL(API_ORIGIN).host : url.host;
}
