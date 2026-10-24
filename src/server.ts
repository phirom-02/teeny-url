import { createApp } from './app.ts';
import { pool } from './db/client.ts';
import { env } from './env.ts';
import { logger } from './lib/logger.ts';

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
const server = createApp().listen(env.PORT, (err) => {
  if (err) {
    logger.fatal({ err }, `Failed to start on port ${env.PORT}`);
    process.exit(1);
  }
  logger.info(`Teeny-URL listening on ${env.BASE_URL} — docs at ${env.BASE_URL}/docs`);
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
