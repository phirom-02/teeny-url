import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import { env } from './env.ts';
import { httpLogger } from './lib/logger.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { notFound } from './middleware/not-found.ts';
import { apiRateLimit } from './middleware/rate-limit.ts';
import { jsonCsp } from './middleware/security.ts';
import { setResolvedClientHeaders } from './middleware/ui-headers.ts';
import { docsRouter } from './routes/docs.routes.ts';
import { healthRouter } from './routes/health.routes.ts';
import { linksRouter } from './routes/links.routes.ts';
import { metaRouter, serviceInfo } from './routes/meta.routes.ts';
import { redirectRouter } from './routes/redirect.routes.ts';

export interface AppOptions {
  /** SvelteKit adapter-node handler; when absent the app is API-only. */
  uiHandler?: RequestHandler;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  // `req.ip` (rate limiting) and `req.protocol` (the UI's CSRF origin check, the session cookie's
  // `Secure` flag) honour `X-Forwarded-For` / `-Proto` only from these hops, so clients can't
  // spoof them. Loopback always: the web UI's server code calls the API over loopback with
  // `X-Forwarded-For: <client ip>`. `TRUST_PROXY` adds an off-host TLS-terminating proxy
  // (Docker network, k8s ingress, cloud LB) — without it every request looks like plain http
  // from the proxy's address.
  app.set('trust proxy', ['loopback', ...env.TRUST_PROXY]);

  app.use(httpLogger); // first, so every response (errors included) gets an X-Request-Id
  // No global CSP: JSON routes use `jsonCsp`, `/docs` its own, and the web UI sets a nonce-based one.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(healthRouter); // GET /health
  app.use(docsRouter); // GET /docs, GET /openapi.json

  app.use(
    '/api',
    jsonCsp,
    // Let browser clients read the headers the API documents.
    cors({
      exposedHeaders: ['Location', 'X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    }),
    express.json({ limit: '16kb' }), // larger bodies → 413; scoped so UI form posts keep their body
    apiRateLimit,
    metaRouter, // GET /api, GET /api/me
    linksRouter, // /api/links/…
    notFound, // unknown /api/* paths never reach the web UI
  );

  // GET /:code — matches any single segment, so it comes after every fixed route. Reserved words
  // (UI pages), file-like paths and (for browsers) unknown codes fall through to what follows.
  // Its rate limit sits inside the router, so UI pages and assets don't spend the redirect budget.
  app.use(redirectRouter);

  if (options.uiHandler) {
    // The web UI owns everything else: pages, form actions (any method), /_app/* assets, its 404.
    app.use(setResolvedClientHeaders, options.uiHandler);
  } else {
    app.use(jsonCsp); // everything left is JSON
    app.get('/', serviceInfo);
    app.use(notFound);
  }

  app.use(errorHandler);

  return app;
}
