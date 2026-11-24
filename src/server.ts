import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestHandler } from 'express';
import { createApp } from './app.ts';
import { pool } from './db/client.ts';
import { env } from './env.ts';
import { logger } from './lib/logger.ts';
import { createUiHandler } from './middleware/ui-static.ts';

/** Static React build produced by `pnpm build`. */
const UI_DIST_DIR = fileURLToPath(new URL('../web/dist', import.meta.url));

/** Loads the static web UI handler, or returns `undefined` to serve the API only. */
function loadUiHandler(): RequestHandler | undefined {
  if (!env.SERVE_UI) return undefined;

  if (!existsSync(path.join(UI_DIST_DIR, 'index.html'))) {
    logger.warn('Web UI not built — run `pnpm build`; serving API only');
    return undefined;
  }

  return createUiHandler(UI_DIST_DIR);
}

const uiHandler = loadUiHandler();

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
const server = createApp({ uiHandler }).listen(env.PORT, (err) => {
  if (err) {
    logger.fatal({ err }, `Failed to start on port ${env.PORT}`);
    process.exit(1);
  }
  const ui = uiHandler ? `web UI at ${env.BASE_URL}/` : 'web UI not mounted (API only)';
  logger.info(`Teeny-URL listening on ${env.BASE_URL} — docs at ${env.BASE_URL}/docs, ${ui}`);
});

function shutdown(signal: NodeJS.Signals) {
  logger.info(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
