import { describe, expect, it } from 'vitest';
import { Link } from '../src/schemas/links.ts';
import { api, clickRowsFor, createLink, createTestKey, expectError } from './helpers.ts';

const TARGET = 'https://example.com/landing?utm_source=teeny&x=1';

async function getLink(auth: { Authorization: string }, code: string): Promise<Link> {
  const res = await api().get(`/api/links/${code}`).set(auth);
  expect(res.status).toBe(200);
  return Link.parse(res.body);
}

describe('GET /:code', () => {
  it('redirects with 302 to the target URL and disables caching', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });

    const res = await api().get(`/${link.code}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(TARGET);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('redirects custom aliases', async () => {
    const { auth } = await createTestKey();
    await createLink(auth, { url: TARGET, alias: 'my-alias' });

    const res = await api().get('/my-alias');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(TARGET);
  });

  it('matches codes case-sensitively', async () => {
    const { auth } = await createTestKey();
    await createLink(auth, { url: TARGET, alias: 'CaseTest' });

    expectError(await api().get('/casetest'), 404, 'NOT_FOUND');
  });

  it('does not require authentication', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });

    const res = await api().get(`/${link.code}`).set('Authorization', 'Bearer invalid');

    expect(res.status).toBe(302);
  });

  it('increments clickCount and sets lastClickedAt', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });

    await api().get(`/${link.code}`);
    await api().get(`/${link.code}`);

    const updated = await getLink(auth, link.code);
    expect(updated.clickCount).toBe(2);
    expect(updated.lastClickedAt).not.toBeNull();
    expect(Date.parse(updated.lastClickedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(updated.createdAt),
    );
  });

  it('records a click with the referrer hostname (lowercased) and user agent', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });

    await api()
      .get(`/${link.code}`)
      .set('Referer', 'https://News.Example.com/a?b=1')
      .set('User-Agent', 'TeenyTest/1.0');

    const rows = await clickRowsFor(link.code);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referrer).toBe('news.example.com');
    expect(rows[0]?.userAgent).toBe('TeenyTest/1.0');
    expect(rows[0]?.clickedAt).toBeInstanceOf(Date);
  });

  it('records one click row per redirect', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });

    for (let i = 0; i < 3; i++) await api().get(`/${link.code}`);

    expect(await clickRowsFor(link.code)).toHaveLength(3);
  });

  it('counts concurrent clicks without losing updates', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });

    const results = await Promise.all(Array.from({ length: 10 }, () => api().get(`/${link.code}`)));

    expect(results.every((r) => r.status === 302)).toBe(true);
    expect((await getLink(auth, link.code)).clickCount).toBe(10);
    expect(await clickRowsFor(link.code)).toHaveLength(10);
  });

  it('returns 404 NOT_FOUND JSON for an unknown code', async () => {
    const res = await api().get('/nope123');

    expectError(res, 404, 'NOT_FOUND');
  });

  it.each(['/bad.code', '/x', '/favicon.ico'])('returns 404 for the odd path %s', async (path) => {
    expectError(await api().get(path), 404, 'NOT_FOUND');
  });
});

describe('HEAD /:code', () => {
  it('returns the redirect without counting a click', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });

    const res = await api().head(`/${link.code}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(TARGET);
    const after = await getLink(auth, link.code);
    expect(after.clickCount).toBe(0);
    expect(after.lastClickedAt).toBeNull();
    expect(await clickRowsFor(link.code)).toHaveLength(0);
  });

  it('returns 404 for an unknown code', async () => {
    const res = await api().head('/nope123');

    expect(res.status).toBe(404);
  });
});
