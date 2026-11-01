import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/client.ts';
import { apiKeys } from '../src/db/schema.ts';
import {
  authenticate,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../src/services/api-keys.service.ts';
import { api, createTestKey, expectError } from './helpers.ts';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const randomWellFormedKey = () => `tny_${randomBytes(24).toString('base64url')}`;

describe('requireApiKey', () => {
  const protectedRoutes = [
    ['GET', '/api/links'],
    ['POST', '/api/links'],
    ['GET', '/api/links/abc1234'],
    ['DELETE', '/api/links/abc1234'],
    ['GET', '/api/links/abc1234/stats'],
    ['GET', '/api/me'],
  ] as const;

  it.each(protectedRoutes)(
    '%s %s without a key → 401 with WWW-Authenticate',
    async (method, path) => {
      const res =
        method === 'POST'
          ? await api().post(path).send({ url: 'https://example.com/x' })
          : method === 'DELETE'
            ? await api().delete(path)
            : await api().get(path);

      expectError(res, 401, 'UNAUTHORIZED');
      expect(res.headers['www-authenticate']).toBeDefined();
      expect(res.headers['www-authenticate']).toMatch(/bearer/i);
    },
  );

  it('rejects a non-Bearer scheme', async () => {
    const { key } = await createTestKey();
    const res = await api().get('/api/links').set('Authorization', `Basic ${key}`);

    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('rejects an empty Bearer token', async () => {
    const res = await api().get('/api/links').set('Authorization', 'Bearer ');

    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('rejects a malformed token', async () => {
    const res = await api().get('/api/links').set('Authorization', 'Bearer not-a-teeny-key');

    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('rejects a well-formed but unknown key', async () => {
    await createTestKey();
    const res = await api()
      .get('/api/links')
      .set('Authorization', `Bearer ${randomWellFormedKey()}`);

    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('rejects a key with only the right prefix', async () => {
    const { key } = await createTestKey();
    const tampered = `${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}`;
    const res = await api().get('/api/links').set('Authorization', `Bearer ${tampered}`);

    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('accepts a valid key', async () => {
    const { auth } = await createTestKey();
    const res = await api().get('/api/links').set(auth);

    expect(res.status).toBe(200);
  });

  it('rejects a key after it has been revoked by prefix', async () => {
    const { auth, apiKey } = await createTestKey();
    expect((await api().get('/api/links').set(auth)).status).toBe(200);

    const revoked = await revokeApiKey(apiKey.prefix);
    expect(revoked?.id).toBe(apiKey.id);

    const res = await api().get('/api/links').set(auth);
    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('rejects a key after it has been revoked by id', async () => {
    const { auth, apiKey } = await createTestKey();

    const revoked = await revokeApiKey(apiKey.id);
    expect(revoked?.id).toBe(apiKey.id);

    expectError(await api().get('/api/links').set(auth), 401, 'UNAUTHORIZED');
  });

  it('revoking one key does not affect another', async () => {
    const a = await createTestKey('a');
    const b = await createTestKey('b');

    await revokeApiKey(a.apiKey.prefix);

    expect((await api().get('/api/links').set(b.auth)).status).toBe(200);
  });
});

describe('createApiKey', () => {
  it('returns a tny_ key and stores only its SHA-256 hash and display prefix', async () => {
    const { key, apiKey } = await createApiKey('ci');

    expect(key).toMatch(/^tny_[A-Za-z0-9_-]{32}$/);
    expect(apiKey.name).toBe('ci');
    expect(apiKey.prefix).toBe(key.slice(0, 12));
    expect(apiKey.keyHash).toBe(sha256(key));
    expect(apiKey.revokedAt).toBeNull();

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
    expect(row).toBeDefined();
    expect(row?.keyHash).toBe(sha256(key));
    expect(Object.values(row ?? {})).not.toContain(key);
  });

  it('creates distinct keys on each call', async () => {
    const a = await createApiKey('same-name');
    const b = await createApiKey('same-name');

    expect(a.key).not.toBe(b.key);
    expect(a.apiKey.id).not.toBe(b.apiKey.id);
    expect(a.apiKey.keyHash).not.toBe(b.apiKey.keyHash);
  });
});

describe('listApiKeys', () => {
  it('returns every created key', async () => {
    const a = await createTestKey('alpha');
    const b = await createTestKey('beta');

    const keys = await listApiKeys();

    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.id).sort()).toEqual([a.apiKey.id, b.apiKey.id].sort());
    expect(keys.map((k) => k.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('returns an empty list when there are no keys', async () => {
    expect(await listApiKeys()).toEqual([]);
  });
});

describe('revokeApiKey', () => {
  it('returns null when nothing matches', async () => {
    await createTestKey();

    expect(await revokeApiKey('nope')).toBeNull();
  });

  it('sets revokedAt on the revoked key', async () => {
    const { apiKey } = await createTestKey();

    const revoked = await revokeApiKey(apiKey.prefix);

    expect(revoked?.revokedAt).toBeInstanceOf(Date);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });

  it('returns null when the key is already revoked', async () => {
    const { apiKey } = await createTestKey();
    await revokeApiKey(apiKey.prefix);

    expect(await revokeApiKey(apiKey.prefix)).toBeNull();
  });
});

describe('authenticate', () => {
  it('resolves a valid key to its id, name and prefix', async () => {
    const { key, apiKey } = await createTestKey('svc');

    const result = await authenticate(key);

    expect(result).toEqual(
      expect.objectContaining({ id: apiKey.id, name: 'svc', prefix: apiKey.prefix }),
    );
  });

  it('returns null for an unknown or revoked key', async () => {
    const { key, apiKey } = await createTestKey();

    expect(await authenticate(randomWellFormedKey())).toBeNull();
    await revokeApiKey(apiKey.prefix);
    expect(await authenticate(key)).toBeNull();
  });
});
