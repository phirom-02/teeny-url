import { env } from '../env.ts';

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

/** Hostname without a trailing dot or IPv6 brackets: `localhost.` → `localhost`, `[::1]` → `::1`. */
function normalizeHostname(url: URL): string {
  return url.hostname.replace(/\.$/, '').replace(/^\[(.*)\]$/, '$1');
}

function effectivePort(url: URL): string {
  return url.port || DEFAULT_PORTS[url.protocol] || '';
}

/** Every spelling of "this machine": localhost, 127.0.0.0/8, ::1, 0.0.0.0. */
function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  );
}

/**
 * True when the URL points back at this service (would create a redirect loop).
 * WHATWG URL parsing already lowercases hosts and canonicalizes IPv4 forms like `2130706433`.
 */
export function isSelfReferential(url: string): boolean {
  const target = URL.parse(url);
  const self = URL.parse(env.BASE_URL);
  if (!target || !self) return false;
  if (effectivePort(target) !== effectivePort(self)) return false;

  const targetHost = normalizeHostname(target);
  const selfHost = normalizeHostname(self);
  if (targetHost === selfHost) return true;
  return isLoopback(selfHost) && isLoopback(targetHost);
}
