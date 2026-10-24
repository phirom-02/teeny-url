import { randomBytes } from 'node:crypto';
import { SHORT_CODE_LENGTH } from '../schemas/links.ts';

export const SHORT_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Bytes at or above this value are rejected: 248 is the largest multiple of 62 that fits in a
 * byte, so `byte % 62` over [0, 248) hits every character exactly 4 times (no modulo bias).
 */
const BYTE_LIMIT = 256 - (256 % SHORT_CODE_ALPHABET.length);

/** Returns a cryptographically random base62 code. */
export function generateShortCode(length: number = SHORT_CODE_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`Short code length must be a positive integer, got ${length}`);
  }

  let code = '';
  while (code.length < length) {
    // ~3% of bytes are rejected, so a small surplus almost always finishes in one pass.
    const bytes = randomBytes(length - code.length + 4);
    for (const byte of bytes) {
      if (byte >= BYTE_LIMIT) continue;
      code += SHORT_CODE_ALPHABET.charAt(byte % SHORT_CODE_ALPHABET.length);
      if (code.length === length) break;
    }
  }
  return code;
}
