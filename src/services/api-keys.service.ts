import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { type ApiKeyRow, apiKeys } from '../db/schema.ts';
import { generateApiKey, hashApiKey, isWellFormedApiKey } from '../lib/api-key.ts';
import { AppError } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';
import type { AuthenticatedKey } from '../types/express.d.ts';

const NAME_MAX_LENGTH = 64;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Creates a key. The plaintext `key` is returned once and never stored. */
export async function createApiKey(name: string): Promise<{ key: string; apiKey: ApiKeyRow }> {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length < 1 || trimmed.length > NAME_MAX_LENGTH) {
    throw new AppError('VALIDATION_ERROR', 'Invalid request', [
      { path: 'name', message: `Name must be 1–${NAME_MAX_LENGTH} characters` },
    ]);
  }

  const { key, prefix, hash } = generateApiKey();
  const [apiKey] = await db
    .insert(apiKeys)
    .values({ name: trimmed, prefix, keyHash: hash })
    .returning();
  if (!apiKey) throw new Error('Insert into api_keys returned no row');

  return { key, apiKey };
}

/** All keys (active and revoked), newest first. */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
}

/**
 * Revokes a key by id or display prefix. Returns null when no active key matches.
 * Refuses (VALIDATION_ERROR) when a prefix is shared by several active keys.
 */
export async function revokeApiKey(idOrPrefix: string): Promise<ApiKeyRow | null> {
  const input = typeof idOrPrefix === 'string' ? idOrPrefix.trim() : '';
  if (!input) return null;

  let id: string;
  if (UUID_PATTERN.test(input)) {
    id = input.toLowerCase();
  } else {
    const matches = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.prefix, input), isNull(apiKeys.revokedAt)))
      .limit(2);
    const [first] = matches;
    if (!first) return null;
    if (matches.length > 1) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Prefix "${input}" matches more than one active key; revoke by id instead`,
        [{ path: 'idOrPrefix', message: 'Ambiguous prefix — use the key id' }],
      );
    }
    id = first.id;
  }

  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning();

  return revoked ?? null;
}

/** Resolves a plaintext token to an active (non-revoked) key, or null. */
export async function authenticate(token: string): Promise<AuthenticatedKey | null> {
  if (!isWellFormedApiKey(token)) return null;

  const [key] = await db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(token)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!key) return null;

  // Fire-and-forget: bookkeeping must not add latency to (or fail) the request.
  db.update(apiKeys)
    .set({ lastUsedAt: sql`now()` })
    .where(eq(apiKeys.id, key.id))
    .catch((err: unknown) => {
      logger.warn({ err, apiKeyId: key.id }, 'Failed to update api_keys.last_used_at');
    });

  return { id: key.id, name: key.name, prefix: key.prefix };
}
