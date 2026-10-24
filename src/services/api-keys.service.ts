// STUB (Phase 1): replaced during Phase 2. Owner: auth agent.
import type { ApiKeyRow } from '../db/schema.ts';
import type { AuthenticatedKey } from '../types/express.d.ts';

/** Creates a key. The plaintext `key` is returned once and never stored. */
export async function createApiKey(_name: string): Promise<{ key: string; apiKey: ApiKeyRow }> {
  throw new Error('Not implemented');
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  throw new Error('Not implemented');
}

/** Revokes a key by id or display prefix. Returns null when no active key matches. */
export async function revokeApiKey(_idOrPrefix: string): Promise<ApiKeyRow | null> {
  throw new Error('Not implemented');
}

/** Resolves a plaintext token to an active (non-revoked) key, or null. */
export async function authenticate(_token: string): Promise<AuthenticatedKey | null> {
  throw new Error('Not implemented');
}
