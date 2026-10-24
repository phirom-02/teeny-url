/** Environment for the test run. Applied by vitest (`test.env`) before any app module is imported. */
export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://teeny:teeny@localhost:5432/teeny_url_test',
  BASE_URL: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
} as const;
