// STUB (Phase 1): replaced during Phase 2. Owner: auth agent.

export const API_KEY_PREFIX = 'tny_';

export interface GeneratedApiKey {
  /** Full plaintext key — shown to the user once, never stored. */
  key: string;
  /** Display prefix stored in the DB (e.g. `tny_AbCd1234`). */
  prefix: string;
  /** SHA-256 hex digest stored in the DB. */
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  throw new Error('Not implemented');
}

export function hashApiKey(_key: string): string {
  throw new Error('Not implemented');
}
