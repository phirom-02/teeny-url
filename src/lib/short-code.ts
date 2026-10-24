// STUB (Phase 1): replaced during Phase 2. Owner: links agent.
import { SHORT_CODE_LENGTH } from '../schemas/links.ts';

export const SHORT_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Returns a cryptographically random base62 code. */
export function generateShortCode(_length: number = SHORT_CODE_LENGTH): string {
  throw new Error('Not implemented');
}
