import { isIP } from 'node:net';
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

/**
 * adapter-node settings that must match what `setResolvedClientHeaders` (middleware/ui-headers.ts)
 * writes: exactly one, Express-resolved value in each of these headers. Another `ADDRESS_HEADER`
 * (e.g. `x-real-ip`) would be client-spoofable — only these two are overwritten — and
 * `XFF_DEPTH` > 1 makes `getClientAddress()` throw, so every UI user would share one rate-limit
 * bucket. Proxy hops are configured with `TRUST_PROXY` instead.
 */
const PINNED_UI_ENV = {
  ADDRESS_HEADER: 'x-forwarded-for',
  PROTOCOL_HEADER: 'x-forwarded-proto',
  XFF_DEPTH: '1',
} as const;

function pinUiEnv() {
  for (const [name, value] of Object.entries(PINNED_UI_ENV)) {
    const previous = process.env[name];
    if (previous !== undefined && previous.trim().toLowerCase() !== value) {
      logger.warn(
        `${name}=${previous} overridden with ${value}: Express resolves the client address and ` +
          'protocol from trusted proxies and hands the web UI exactly one value of each — ' +
          'configure reverse proxies with TRUST_PROXY instead',
      );
    }
    process.env[name] = value;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[(.*)\]$/, '$1'); // URL keeps IPv6 hosts bracketed
  if (host === 'localhost' || host === '::1') return true;
  return isIP(host) === 4 && host.startsWith('127.');
}

/** The API honours the UI's `X-Forwarded-For` only from loopback (`trust proxy` in app.ts). */
function checkApiOrigin() {
  const origin = process.env.API_ORIGIN ?? '';
  const hostname = URL.canParse(origin) ? new URL(origin).hostname : '';
  if (!isLoopbackHost(hostname)) {
    logger.warn(
      `API_ORIGIN=${origin} is not a loopback address: the API trusts the web UI's ` +
        'X-Forwarded-For only over loopback, so all web UI users will share one rate-limit bucket',
    );
  }
}

function isMissingModule(err: unknown, url: URL): boolean {
  const { code, url: missing } = (err ?? {}) as { code?: unknown; url?: unknown };
  return code === 'ERR_MODULE_NOT_FOUND' && missing === url.href;
}

/** Loads the built web UI, or returns `undefined` to serve the API only. */
async function loadUiHandler(): Promise<RequestHandler | undefined> {
  if (!env.SERVE_UI) return undefined;

  // adapter-node reads these when its module loads.
  pinUiEnv();

  try {
    const { handler } = (await import(UI_HANDLER_URL.href)) as { handler: RequestHandler };
    checkApiOrigin();
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
