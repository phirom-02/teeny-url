import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pkg from '../package.json' with { type: 'json' };
import { httpLogger } from './lib/logger.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { notFound } from './middleware/not-found.ts';
import { apiRateLimit } from './middleware/rate-limit.ts';
import { docsRouter } from './routes/docs.routes.ts';
import { healthRouter } from './routes/health.routes.ts';
import { linksRouter } from './routes/links.routes.ts';
import { redirectRouter } from './routes/redirect.routes.ts';
import type { RootResponse } from './schemas/common.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(httpLogger); // first, so every response (errors included) gets an X-Request-Id
  app.use(helmet()); // strict default CSP; /docs swaps in its own (see docs.routes.ts)
  app.use(cors());
  app.use(express.json({ limit: '16kb' })); // larger bodies → 413 PAYLOAD_TOO_LARGE

  app.get('/', (_req, res) => {
    const body: RootResponse = { name: 'Teeny-URL', version: pkg.version, docs: '/docs' };
    res.json(body);
  });

  app.use(healthRouter); // GET /health
  app.use(docsRouter); // GET /docs, GET /openapi.json
  app.use('/api', apiRateLimit, linksRouter); // /api/links/…
  app.use(redirectRouter); // GET /:code — keep last, it matches any single segment

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
