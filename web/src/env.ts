import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Environment variables, read at runtime (not inlined at build time) and validated on startup.
 * Private ones are imported from `$app/env/private` (server-only).
 */
export const variables = defineEnvVars({
  API_ORIGIN: {
    description:
      'Origin the server-side code uses to reach the Teeny-URL JSON API. Express sets it to ' +
      'http://127.0.0.1:$PORT when it serves the UI; for `vite dev` it comes from the repo-root .env.',
    schema: (value) => {
      // Defaults to the API's default dev address, so `vite build` works without a .env.
      if (value === undefined || value === '') return 'http://localhost:3000';
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`API_ORIGIN must be an absolute URL such as http://localhost:3000`);
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('API_ORIGIN must use http or https');
      }
      return url.origin;
    },
  },
});
