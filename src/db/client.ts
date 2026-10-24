import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env.ts';
import { logger } from '../lib/logger.ts';
import * as schema from './schema.ts';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  // Fail fast instead of queueing forever when the pool is exhausted or a query hangs.
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});

// An idle client dying (DB restart, network drop) emits 'error' on the pool; unhandled, it would
// crash the process. pg discards the broken client and reconnects on the next query.
pool.on('error', (err) => {
  logger.warn({ err }, 'Idle Postgres client error');
});

export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
