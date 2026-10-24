import { createHash, randomBytes } from 'node:crypto';

/** Every Teeny-URL API key starts with this marker. */
export const API_KEY_PREFIX = 'tny_';

/** Random bytes per key: 24 bytes → 32 base64url characters (192 bits of entropy). */
const RANDOM_BYTES = 24;

/** Total length of a key: `tny_` + 32 base64url characters = 36. */
export const API_KEY_LENGTH = API_KEY_PREFIX.length + Math.ceil((RANDOM_BYTES * 4) / 3);

/** Length of the display prefix stored in the DB: `tny_` + 8 characters = 12. */
export const API_KEY_DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

const API_KEY_PATTERN = new RegExp(
  `^${API_KEY_PREFIX}[A-Za-z0-9_-]{${API_KEY_LENGTH - API_KEY_PREFIX.length}}$`,
);

export interface GeneratedApiKey {
  /** Full plaintext key — shown to the user once, never stored. */
  key: string;
  /** Display prefix stored in the DB (e.g. `tny_AbCd1234`). */
  prefix: string;
  /** SHA-256 hex digest stored in the DB. */
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const key = API_KEY_PREFIX + randomBytes(RANDOM_BYTES).toString('base64url');
  return {
    key,
    prefix: key.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH),
    hash: hashApiKey(key),
  };
}

/** SHA-256 hex digest of a key — the value stored in, and looked up from, `api_keys.key_hash`. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Cheap syntactic check (prefix, length, alphabet) to reject garbage before touching the DB. */
export function isWellFormedApiKey(token: string): boolean {
  return (
    typeof token === 'string' && token.length === API_KEY_LENGTH && API_KEY_PATTERN.test(token)
  );
}
