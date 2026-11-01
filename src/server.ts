import { fileURLToPath } from 'node:url';
import type { RequestHandler } from 'express';
import { createApp } from './app.ts';
import { pool } from './db/client.ts';
import { env } from './env.ts';
import { logger } from './lib/logger.ts';

/** The SvelteKit adapter-node build produced by `pnpm build`. */
const UI_HANDLER_URL = new URL('../web/build/handler.js', import.meta.url);

// The web UI's server code calls the JSON API here (over loopback — see `trust proxy` in app.ts).
// Set before the UI module loads: SvelteKit snapshots process.env when it initializes.
process.env.API_ORIGIN ??= `http://127.0.0.1:${env.PORT}`;

function isMissingModule(err: unknown, url: URL): boolean {
  const { code, url: missing } = (err ?? {}) as { code?: unknown; url?: unknown };
  return code === 'ERR_MODULE_NOT_FOUND' && missing === url.href;
}

/** Loads the built web UI, or returns `undefined` to serve the API only. */
async function loadUiHandler(): Promise<RequestHandler | undefined> {
  if (!env.SERVE_UI) return undefined;

  // adapter-node reads these when its module loads; app.ts fills both headers in from what
  // Express resolved (see middleware/ui-headers.ts). Explicit settings win.
  process.env.PROTOCOL_HEADER ??= 'x-forwarded-proto';
  process.env.ADDRESS_HEADER ??= 'x-forwarded-for';

  try {
    const { handler } = (await import(UI_HANDLER_URL.href)) as { handler: RequestHandler };
    return handler;
  } catch (err) {
    if (isMissingModule(err, UI_HANDLER_URL)) {
      logger.warn('Web UI not built — run `pnpm build`; serving API only');
      return undefined;
    }
    logger.fatal({ err }, `Failed to load the web UI from ${fileURLToPath(UI_HANDLER_URL)}`);
    process.exit(1);
  }
}

const uiHandler = await loadUiHandler();

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
