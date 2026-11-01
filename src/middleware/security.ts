import helmet from 'helmet';

/**
 * Strict CSP for JSON responses (the API, `/health`, `/openapi.json`): they never load anything
 * and must never be framed. There is no app-wide CSP: the web UI (SvelteKit) sends its own
 * nonce-based policy and `/docs` sends one tailored to Scalar (see docs.routes.ts).
 */
export const jsonCsp = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
});
