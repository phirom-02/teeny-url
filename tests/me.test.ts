import { describe, expect, it } from 'vitest';
import { MeResponse } from '../src/schemas/keys.ts';
import { revokeApiKey } from '../src/services/api-keys.service.ts';
import { api, apiWithUi, BROWSER_ACCEPT, createTestKey, expectError } from './helpers.ts';

describe('GET /api/me', () => {
  it('returns exactly the name and display prefix of the calling key', async () => {
    const { auth, apiKey } = await createTestKey('my-laptop');

    const res = await api().get('/api/me').set(auth);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ name: 'my-laptop', prefix: apiKey.prefix });
    expect(MeResponse.parse(res.body)).toEqual(res.body);
  });

  it('identifies the key that made the request when several exist', async () => {
    await createTestKey('alpha');
    const beta = await createTestKey('beta');

    const res = await api().get('/api/me').set(beta.auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'beta', prefix: beta.apiKey.prefix });
  });

  it('never exposes the key id, hash or the plaintext key', async () => {
    const { key, auth, apiKey } = await createTestKey();

    const res = await api().get('/api/me').set(auth);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain(key);
    expect(res.text).not.toContain(apiKey.keyHash);
    expect(res.text).not.toContain(apiKey.id);
  });

  it('returns 401 with WWW-Authenticate without a key', async () => {
    const res = await api().get('/api/me');

    expectError(res, 401, 'UNAUTHORIZED');
    expect(res.headers['www-authenticate']).toMatch(/bearer/i);
  });

  it('returns 401 for an unknown key', async () => {
    await createTestKey();

    const res = await api()
      .get('/api/me')
      .set('Authorization', 'Bearer tny_0000000000000000000000000000000x');

    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('returns 401 once the key has been revoked', async () => {
    const { auth, apiKey } = await createTestKey();
    expect((await api().get('/api/me').set(auth)).status).toBe(200);

    await revokeApiKey(apiKey.prefix);

    const res = await api().get('/api/me').set(auth);
    expectError(res, 401, 'UNAUTHORIZED');
    expect(res.headers['www-authenticate']).toMatch(/bearer/i);
  });

  it('answers with JSON on the UI-mounted app, even for a browser Accept header', async () => {
    const { auth, apiKey } = await createTestKey('web');

    const res = await apiWithUi().get('/api/me').set(auth).set('Accept', BROWSER_ACCEPT);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ name: 'web', prefix: apiKey.prefix });
  });
});
