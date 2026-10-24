import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  /** Public origin used to build short URLs: scheme + host (+ port), no path. */
  BASE_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3000')
    .refine((url) => new URL(url).pathname === '/', 'BASE_URL must be an origin, without a path')
    .transform((url) => new URL(url).origin),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
