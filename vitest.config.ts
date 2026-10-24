import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './tests/test-env.ts';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // `src/env.ts` reads process.env at import time, so this must be in place before app imports.
    env: { ...TEST_ENV },
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
    // Every test file shares one database (truncated before each test): run files one at a time.
    fileParallelism: false,
  },
});
