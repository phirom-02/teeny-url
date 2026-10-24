import { env } from '../env.ts';

/** True when the URL points back at this service (would create a redirect loop). */
export function isSelfReferential(url: string): boolean {
  const target = URL.parse(url);
  const self = URL.parse(env.BASE_URL);
  if (!target || !self) return false;
  return target.host.toLowerCase() === self.host.toLowerCase();
}
