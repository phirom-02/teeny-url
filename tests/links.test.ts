import { describe, expect, it } from 'vitest';
import { Link, LinkList } from '../src/schemas/links.ts';
import {
  api,
  BASE_URL,
  createLink,
  createTestKey,
  expectError,
  expectValidationError,
  setLinkCreatedAt,
} from './helpers.ts';

const TARGET = 'https://example.com/a/long/path?with=query&and=more';

describe('POST /api/links', () => {
  describe('with a random code', () => {
    it('creates a link and returns 201 with the full Link and a Location header', async () => {
      const { auth } = await createTestKey();
      const before = Date.now();

      const res = await api().post('/api/links').set(auth).send({ url: TARGET });

      expect(res.status).toBe(201);
      const link = Link.parse(res.body);
      expect(link.code).toMatch(/^[0-9A-Za-z]{7}$/);
      expect(link).toEqual({
        code: link.code,
        shortUrl: `${BASE_URL}/${link.code}`,
        targetUrl: TARGET,
        isCustom: false,
        clickCount: 0,
        lastClickedAt: null,
        createdAt: expect.any(String),
      });
      expect(res.headers.location).toBe(`/api/links/${link.code}`);
      // createdAt is a real, recent timestamp (generous bounds: DB and app clocks may differ slightly).
      const createdAt = Date.parse(link.createdAt);
      expect(Math.abs(createdAt - before)).toBeLessThan(60_000);
    });

    it('generates a different code for each link, even for the same URL', async () => {
      const { auth } = await createTestKey();

      const a = await createLink(auth, { url: TARGET });
      const b = await createLink(auth, { url: TARGET });

      expect(a.code).not.toBe(b.code);
    });

    it('accepts plain http URLs', async () => {
      const { auth } = await createTestKey();

      const link = await createLink(auth, { url: 'http://example.org/page' });

      expect(link.targetUrl).toBe('http://example.org/page');
    });

    it('accepts a URL of exactly 2048 characters', async () => {
      const { auth } = await createTestKey();
      const prefix = 'https://example.com/';
      const url = prefix + 'a'.repeat(2048 - prefix.length);
      expect(url).toHaveLength(2048);

      const link = await createLink(auth, { url });

      expect(link.targetUrl).toBe(url);
    });
  });

  describe('with a custom alias', () => {
    it('uses the alias as the code and marks the link custom', async () => {
      const { auth } = await createTestKey();

      const res = await api()
        .post('/api/links')
        .set(auth)
        .send({ url: TARGET, alias: 'launch-day' });

      expect(res.status).toBe(201);
      const link = Link.parse(res.body);
      expect(link.code).toBe('launch-day');
      expect(link.isCustom).toBe(true);
      expect(link.shortUrl).toBe(`${BASE_URL}/launch-day`);
      expect(res.headers.location).toBe('/api/links/launch-day');
    });

    it.each(['abc', 'A_b-9', 'x'.repeat(32), 'apis', 'docs-page', 'Health2'])(
      'accepts the valid alias %s',
      async (alias) => {
        const { auth } = await createTestKey();

        const link = await createLink(auth, { url: TARGET, alias });

        expect(link.code).toBe(alias);
      },
    );

    it('treats aliases as case-sensitive', async () => {
      const { auth } = await createTestKey();

      const upper = await createLink(auth, { url: 'https://example.com/upper', alias: 'MyAlias' });
      const lower = await createLink(auth, { url: 'https://example.com/lower', alias: 'myalias' });

      expect(upper.code).toBe('MyAlias');
      expect(lower.code).toBe('myalias');
    });

    it('returns 409 ALIAS_TAKEN for a duplicate alias from the same key', async () => {
      const { auth } = await createTestKey();
      await createLink(auth, { url: TARGET, alias: 'taken' });

      const res = await api().post('/api/links').set(auth).send({ url: TARGET, alias: 'taken' });

      expectError(res, 409, 'ALIAS_TAKEN');
    });

    it('returns 409 ALIAS_TAKEN for a duplicate alias from another key', async () => {
      const owner = await createTestKey('owner');
      const other = await createTestKey('other');
      await createLink(owner.auth, { url: TARGET, alias: 'shared' });

      const res = await api()
        .post('/api/links')
        .set(other.auth)
        .send({ url: 'https://example.com/other', alias: 'shared' });

      expectError(res, 409, 'ALIAS_TAKEN');
    });

    it('lets exactly one of two concurrent creates claim an alias', async () => {
      const a = await createTestKey('a');
      const b = await createTestKey('b');

      const results = await Promise.all([
        api().post('/api/links').set(a.auth).send({ url: TARGET, alias: 'race' }),
        api().post('/api/links').set(b.auth).send({ url: TARGET, alias: 'race' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it.each(['api', 'docs', 'health', 'openapi', 'admin', 'static', 'API', 'Docs', 'HeAlTh'])(
      'rejects the reserved alias %s',
      async (alias) => {
        const { auth } = await createTestKey();

        const res = await api().post('/api/links').set(auth).send({ url: TARGET, alias });

        const details = expectValidationError(res);
        expect(details.map((d) => d.path)).toContain('alias');
      },
    );

    it.each([
      ['too short', 'ab'],
      ['too long', 'x'.repeat(33)],
      ['a space', 'has space'],
      ['a dot', 'bad.code'],
      ['a slash', 'a/b'],
      ['non-ASCII letters', 'café'],
      ['empty', ''],
    ])('rejects an alias with %s', async (_label, alias) => {
      const { auth } = await createTestKey();

      const res = await api().post('/api/links').set(auth).send({ url: TARGET, alias });

      const details = expectValidationError(res);
      expect(details.map((d) => d.path)).toContain('alias');
    });

    it('rejects a non-string alias', async () => {
      const { auth } = await createTestKey();

      const res = await api().post('/api/links').set(auth).send({ url: TARGET, alias: 12345 });

      expectValidationError(res);
    });
  });

  describe('URL validation', () => {
    it.each([
      ['ftp', 'ftp://example.com/file.txt'],
      ['javascript', 'javascript:alert(1)'],
      ['mailto', 'mailto:someone@example.com'],
      ['data', 'data:text/html,<h1>hi</h1>'],
      ['malformed', 'not a url'],
      ['scheme only', 'http://'],
      ['relative', '/just/a/path'],
      ['empty', ''],
    ])('rejects a %s URL', async (_label, url) => {
      const { auth } = await createTestKey();

      const res = await api().post('/api/links').set(auth).send({ url });

      const details = expectValidationError(res);
      expect(details.map((d) => d.path)).toContain('url');
    });

    it('rejects a URL longer than 2048 characters', async () => {
      const { auth } = await createTestKey();
      const prefix = 'https://example.com/';
      const url = prefix + 'a'.repeat(2049 - prefix.length);

      const res = await api().post('/api/links').set(auth).send({ url });

      const details = expectValidationError(res);
      expect(details.map((d) => d.path)).toContain('url');
    });

    it('rejects a missing url', async () => {
      const { auth } = await createTestKey();

      const res = await api().post('/api/links').set(auth).send({ alias: 'no-url' });

      const details = expectValidationError(res);
      expect(details.map((d) => d.path)).toContain('url');
    });

    it('rejects a non-string url', async () => {
      const { auth } = await createTestKey();

      const res = await api().post('/api/links').set(auth).send({ url: 42 });

      expectValidationError(res);
    });

    it.each([
      `${BASE_URL}/abc1234`,
      `${BASE_URL}/`,
      `${BASE_URL}/api/links`,
      // Other spellings of the same loopback origin (BASE_URL is http://localhost:3000).
      'http://LOCALHOST:3000/x',
      'http://localhost.:3000/x',
      'http://evil@localhost:3000/x',
      'http://127.0.0.1:3000/x',
      'http://127.1.2.3:3000/x',
      'http://2130706433:3000/x',
      'http://[::1]:3000/x',
      'http://0.0.0.0:3000/x',
      'http://app.localhost:3000/x',
    ])('rejects a self-referential URL (%s)', async (url) => {
      const { auth } = await createTestKey();

      const res = await api().post('/api/links').set(auth).send({ url });

      const details = expectValidationError(res);
      expect(details.map((d) => d.path)).toContain('url');
    });

    it.each(['http://localhost:3001/x', 'http://127.0.0.1:8080/x'])(
      'accepts a loopback URL on a different port (%s)',
      async (url) => {
        const { auth } = await createTestKey();

        const res = await api().post('/api/links').set(auth).send({ url });

        expect(res.status).toBe(201);
      },
    );

    it('reports every invalid field in details', async () => {
      const { auth } = await createTestKey();

      const res = await api().post('/api/links').set(auth).send({ url: 'ftp://x.y', alias: 'a' });

      const details = expectValidationError(res);
      expect(details.map((d) => d.path)).toEqual(expect.arrayContaining(['url', 'alias']));
    });
  });

  describe('request body handling', () => {
    it('rejects malformed JSON with 400 VALIDATION_ERROR', async () => {
      const { auth } = await createTestKey();

      const res = await api()
        .post('/api/links')
        .set(auth)
        .set('Content-Type', 'application/json')
        .send('{"url": "https://example.com/",');

      expectError(res, 400, 'VALIDATION_ERROR');
    });

    it('rejects a request without a body', async () => {
      const { auth } = await createTestKey();

      const res = await api().post('/api/links').set(auth);

      expectError(res, 400, 'VALIDATION_ERROR');
    });

    it('rejects a JSON array body', async () => {
      const { auth } = await createTestKey();

      const res = await api()
        .post('/api/links')
        .set(auth)
        .send([{ url: TARGET }]);

      expectError(res, 400, 'VALIDATION_ERROR');
    });

    it('rejects a body larger than 16kb with 413 PAYLOAD_TOO_LARGE', async () => {
      const { auth } = await createTestKey();

      const res = await api()
        .post('/api/links')
        .set(auth)
        .send({ url: TARGET, padding: 'x'.repeat(17 * 1024) });

      expectError(res, 413, 'PAYLOAD_TOO_LARGE');
    });
  });
});

describe('GET /api/links', () => {
  it('returns an empty page with default pagination when the key has no links', async () => {
    const { auth } = await createTestKey();

    const res = await api().get('/api/links').set(auth);

    expect(res.status).toBe(200);
    expect(LinkList.parse(res.body)).toEqual({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    });
  });

  it("returns only the caller's links", async () => {
    const mine = await createTestKey('mine');
    const theirs = await createTestKey('theirs');
    const a = await createLink(mine.auth, { url: 'https://example.com/a' });
    const b = await createLink(mine.auth, { url: 'https://example.com/b' });
    const c = await createLink(theirs.auth, { url: 'https://example.com/c' });

    const res = await api().get('/api/links').set(mine.auth);

    expect(res.status).toBe(200);
    const body = LinkList.parse(res.body);
    expect(body.pagination.total).toBe(2);
    expect(body.data.map((l) => l.code).sort()).toEqual([a.code, b.code].sort());
    expect(body.data.map((l) => l.code)).not.toContain(c.code);
  });

  it('returns links newest first', async () => {
    const { auth } = await createTestKey();
    const oldest = await createLink(auth, { url: 'https://example.com/1', alias: 'oldest' });
    const newest = await createLink(auth, { url: 'https://example.com/2', alias: 'newest' });
    const middle = await createLink(auth, { url: 'https://example.com/3', alias: 'middle' });
    await setLinkCreatedAt(oldest.code, new Date('2026-01-01T00:00:00Z'));
    await setLinkCreatedAt(middle.code, new Date('2026-02-01T00:00:00Z'));
    await setLinkCreatedAt(newest.code, new Date('2026-03-01T00:00:00Z'));

    const res = await api().get('/api/links').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((l: Link) => l.code)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('returns full Link objects', async () => {
    const { auth } = await createTestKey();
    const created = await createLink(auth, { url: TARGET, alias: 'full-link' });

    const res = await api().get('/api/links').set(auth);

    expect(LinkList.parse(res.body).data).toEqual([created]);
  });

  it('defaults to 20 items per page and reports the total', async () => {
    const { auth } = await createTestKey();
    for (let i = 0; i < 25; i++) {
      await createLink(auth, { url: `https://example.com/${i}` });
    }

    const res = await api().get('/api/links').set(auth);

    expect(res.status).toBe(200);
    const body = LinkList.parse(res.body);
    expect(body.data).toHaveLength(20);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 25 });
  });

  it('honours limit and offset', async () => {
    const { auth } = await createTestKey();
    const codes = ['p1', 'p2', 'p3', 'p4', 'p5'].map((alias) => `${alias}-x`);
    for (const [i, alias] of codes.entries()) {
      await createLink(auth, { url: `https://example.com/${i}`, alias });
      await setLinkCreatedAt(alias, new Date(Date.UTC(2026, 0, i + 1)));
    }
    // Newest first: p5, p4, p3, p2, p1
    const res = await api().get('/api/links').query({ limit: 2, offset: 1 }).set(auth);

    expect(res.status).toBe(200);
    const body = LinkList.parse(res.body);
    expect(body.data.map((l) => l.code)).toEqual(['p4-x', 'p3-x']);
    expect(body.pagination).toEqual({ limit: 2, offset: 1, total: 5 });
  });

  it('returns an empty page when offset is past the end', async () => {
    const { auth } = await createTestKey();
    await createLink(auth);

    const res = await api().get('/api/links').query({ offset: 10 }).set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], pagination: { limit: 20, offset: 10, total: 1 } });
  });

  it('accepts the maximum limit of 100', async () => {
    const { auth } = await createTestKey();

    const res = await api().get('/api/links').query({ limit: 100 }).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  it.each([
    ['limit above 100', { limit: 101 }, 'limit'],
    ['limit of 0', { limit: 0 }, 'limit'],
    ['negative limit', { limit: -5 }, 'limit'],
    ['non-integer limit', { limit: 1.5 }, 'limit'],
    ['non-numeric limit', { limit: 'abc' }, 'limit'],
    ['negative offset', { offset: -1 }, 'offset'],
    ['non-numeric offset', { offset: 'abc' }, 'offset'],
  ])('rejects a %s with 400', async (_label, query, path) => {
    const { auth } = await createTestKey();

    const res = await api().get('/api/links').query(query).set(auth);

    const details = expectValidationError(res);
    expect(details.map((d) => d.path)).toContain(path);
  });
});

describe('GET /api/links/:code', () => {
  it('returns the link', async () => {
    const { auth } = await createTestKey();
    const created = await createLink(auth, { url: TARGET });

    const res = await api().get(`/api/links/${created.code}`).set(auth);

    expect(res.status).toBe(200);
    expect(Link.parse(res.body)).toEqual(created);
  });

  it('finds custom aliases case-sensitively', async () => {
    const { auth } = await createTestKey();
    await createLink(auth, { url: TARGET, alias: 'CamelCase' });

    expect((await api().get('/api/links/CamelCase').set(auth)).status).toBe(200);
    expectError(await api().get('/api/links/camelcase').set(auth), 404, 'NOT_FOUND');
  });

  it("returns 404 for another key's link", async () => {
    const owner = await createTestKey('owner');
    const other = await createTestKey('other');
    const link = await createLink(owner.auth);

    const res = await api().get(`/api/links/${link.code}`).set(other.auth);

    expectError(res, 404, 'NOT_FOUND');
  });

  it('returns 404 for an unknown code', async () => {
    const { auth } = await createTestKey();

    expectError(await api().get('/api/links/nope123').set(auth), 404, 'NOT_FOUND');
  });
});

describe('DELETE /api/links/:code', () => {
  it('deletes the link and returns 204 with an empty body', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth);

    const res = await api().delete(`/api/links/${link.code}`).set(auth);

    expect(res.status).toBe(204);
    expect(res.text ?? '').toBe('');
  });

  it('makes the link unavailable everywhere afterwards', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });
    expect((await api().delete(`/api/links/${link.code}`).set(auth)).status).toBe(204);

    expectError(await api().get(`/api/links/${link.code}`).set(auth), 404, 'NOT_FOUND');
    expectError(await api().get(`/api/links/${link.code}/stats`).set(auth), 404, 'NOT_FOUND');
    expectError(await api().get(`/${link.code}`), 404, 'NOT_FOUND');
    const list = await api().get('/api/links').set(auth);
    expect(list.body.data).toEqual([]);
    expect(list.body.pagination.total).toBe(0);
  });

  it('returns 404 when deleting the same link twice', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth);
    await api().delete(`/api/links/${link.code}`).set(auth);

    expectError(await api().delete(`/api/links/${link.code}`).set(auth), 404, 'NOT_FOUND');
  });

  it("returns 404 for another key's link and leaves it intact", async () => {
    const owner = await createTestKey('owner');
    const other = await createTestKey('other');
    const link = await createLink(owner.auth, { url: TARGET });

    const res = await api().delete(`/api/links/${link.code}`).set(other.auth);

    expectError(res, 404, 'NOT_FOUND');
    expect((await api().get(`/api/links/${link.code}`).set(owner.auth)).status).toBe(200);
    const redirect = await api().get(`/${link.code}`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe(TARGET);
  });

  it('returns 404 for an unknown code', async () => {
    const { auth } = await createTestKey();

    expectError(await api().delete('/api/links/nope123').set(auth), 404, 'NOT_FOUND');
  });
});
