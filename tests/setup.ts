import { sql } from 'drizzle-orm';
import { afterAll, beforeEach } from 'vitest';
import { db, pool } from '../src/db/client.ts';

// Every test starts from an empty database.
beforeEach(async () => {
  await db.execute(sql`TRUNCATE clicks, links, api_keys RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});
