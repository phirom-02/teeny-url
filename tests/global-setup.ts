import { runMigrations } from '../src/db/migrate.ts';
import { TEST_ENV } from './test-env.ts';

/** Runs once before the whole suite: brings the test database schema up to date. */
export async function setup(): Promise<void> {
  await runMigrations(TEST_ENV.DATABASE_URL);
}
