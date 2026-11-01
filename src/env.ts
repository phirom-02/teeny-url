import { isIP } from 'node:net';
import { z } from 'zod';

/** Express's named `trust proxy` ranges (`loopback` is always trusted — see app.ts). */
const PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** `true` for an IP address, an `ip/prefix-length` CIDR, or one of {@link PROXY_PRESETS}. */
function isTrustedProxyEntry(entry: string): boolean {
  if (PROXY_PRESETS.has(entry)) return true;
  const [address = '', prefix, ...rest] = entry.split('/');
  // Zone ids (`fe80::1%eth0`) aren't meaningful for matching socket addresses.
  const version = address.includes('%') ? 0 : isIP(address);
  if (version === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  // Express (proxy-addr) rejects `/0` too: trusting every address would make headers spoofable.
  const bits = /^\d{1,3}$/.test(prefix) ? Number(prefix) : 0;
  return bits >= 1 && bits <= (version === 4 ? 32 : 128);
}

/** A comma-separated list, trimmed, without empty entries. */
const commaList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

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
  /** Mount the built SvelteKit UI (`web/build`) in `src/server.ts`. Off in dev (Vite serves it). */
  SERVE_UI: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  /**
   * Extra reverse proxies to trust for `X-Forwarded-For` / `X-Forwarded-Proto`, on top of
   * loopback: comma-separated IPs, CIDRs (`10.0.0.0/8`) or `linklocal` / `uniquelocal`.
   * Set it when a TLS-terminating proxy reaches the app from off-host (Docker network,
   * k8s ingress, cloud load balancer).
   */
  TRUST_PROXY: commaList.pipe(
    z.array(
      z.string().refine(isTrustedProxyEntry, {
        error: (issue) =>
          `Invalid trusted proxy ${JSON.stringify(issue.input)}: expected an IP address, a CIDR ` +
          `such as 10.0.0.0/8, or one of ${[...PROXY_PRESETS].join(', ')}`,
      }),
    ),
  ),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
