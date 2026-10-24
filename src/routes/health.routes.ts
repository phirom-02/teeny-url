import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.ts';
import { logger } from '../lib/logger.ts';
import type { HealthResponse } from '../schemas/common.ts';

/** A health probe should answer fast even when the database hangs. */
const DB_PING_TIMEOUT_MS = 2_000;

async function pingDatabase(): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Database ping timed out')), DB_PING_TIMEOUT_MS);
  });
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  let dbUp = true;
  try {
    await pingDatabase();
  } catch (err) {
    dbUp = false;
    (req.log ?? logger).warn({ err }, 'Health check: database unreachable');
  }

  const body: HealthResponse = dbUp
    ? { status: 'ok', db: 'up', uptime: process.uptime() }
    : { status: 'degraded', db: 'down', uptime: process.uptime() };

  res
    .status(dbUp ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json(body);
});
