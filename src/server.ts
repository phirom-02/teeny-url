import { createApp } from './app.ts';
import { pool } from './db/client.ts';
import { env } from './env.ts';
import { logger } from './lib/logger.ts';

const server = createApp().listen(env.PORT, () => {
  logger.info(`Teeny-URL listening on ${env.BASE_URL} — docs at ${env.BASE_URL}/docs`);
});

function shutdown(signal: NodeJS.Signals) {
  logger.info(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
