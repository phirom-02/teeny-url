import { describe, expect, it } from 'vitest';
import { LinkStats } from '../src/schemas/stats.ts';
import {
  type AuthHeaders,
  api,
  createLink,
  createTestKey,
  DAY_MS,
  expectError,
  insertClicks,
  startOfUtcDay,
  utcDate,
} from './helpers.ts';

async function getStats(auth: AuthHeaders, code: string): Promise<LinkStats> {
  const res = await api().get(`/api/links/${code}/stats`).set(auth);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return LinkStats.parse(res.body);
}

/** The 30 UTC dates the stats window should cover, oldest first, ending today. */
function expectedWindow(now: Date): string[] {
  return Array.from({ length: 30 }, (_, i) => utcDate(startOfUtcDay(now, 29 - i)));
}

describe('GET /api/links/:code/stats', () => {
  it('returns zeroed stats for a link without clicks', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth);
    const now = new Date();

    const stats = await getStats(auth, link.code);

    expect(stats.code).toBe(link.code);
    expect(stats.totalClicks).toBe(0);
    expect(stats.lastClickedAt).toBeNull();
    expect(stats.topReferrers).toEqual([]);
    expect(stats.clicksByDay).toEqual(expectedWindow(now).map((date) => ({ date, clicks: 0 })));
  });

  it('returns exactly 30 consecutive UTC days, oldest first, ending today', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth);
    const now = new Date();

    const { clicksByDay } = await getStats(auth, link.code);

    expect(clicksByDay).toHaveLength(30);
    expect(clicksByDay.map((d) => d.date)).toEqual(expectedWindow(now));
    expect(clicksByDay.at(-1)?.date).toBe(utcDate(now));
  });

  it('reflects real redirects in totals, today and referrers', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth);

    await api().get(`/${link.code}`).set('Referer', 'https://News.Example.com/a?b=1');
    await api().get(`/${link.code}`).set('Referer', 'https://news.example.com/other');
    await api().get(`/${link.code}`);
    const now = new Date();

    const stats = await getStats(auth, link.code);

    expect(stats.totalClicks).toBe(3);
    expect(stats.lastClickedAt).not.toBeNull();
    expect(stats.clicksByDay.at(-1)).toEqual({ date: utcDate(now), clicks: 3 });
    expect(stats.topReferrers).toEqual([
      { referrer: 'news.example.com', clicks: 2 },
      { referrer: 'direct', clicks: 1 },
    ]);
  });

  it('agrees with the link on totalClicks and lastClickedAt', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth);
    await api().get(`/${link.code}`);

    const stats = await getStats(auth, link.code);
    const linkRes = await api().get(`/api/links/${link.code}`).set(auth);

    expect(stats.totalClicks).toBe(linkRes.body.clickCount);
    expect(stats.lastClickedAt).not.toBeNull();
    // Same click, possibly recorded via different clocks (app vs DB): allow a small skew.
    const skew = Math.abs(
      Date.parse(stats.lastClickedAt ?? '') - Date.parse(linkRes.body.lastClickedAt),
    );
    expect(skew).toBeLessThan(1000);
  });

  it('buckets clicks by UTC day and excludes clicks older than the window', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth);
    const now = new Date();
    const today = startOfUtcDay(now);

    await insertClicks(link.code, 2, { clickedAt: now }); // today
    await insertClicks(link.code, 1, { clickedAt: new Date(today.getTime() - 1000) }); // yesterday 23:59:59
    await insertClicks(link.code, 3, { clickedAt: new Date(now.getTime() - 2 * DAY_MS) }); // 2 days ago
    await insertClicks(link.code, 4, {
      clickedAt: new Date(startOfUtcDay(now, 29).getTime() + 1000),
    }); // first day of window
    await insertClicks(link.code, 5, {
      clickedAt: new Date(startOfUtcDay(now, 29).getTime() - 1000),
    }); // just before the window
    await insertClicks(link.code, 6, { clickedAt: new Date(now.getTime() - 40 * DAY_MS) }); // 40 days ago

    const { clicksByDay } = await getStats(auth, link.code);

    const expected = new Map<string, number>([
      [utcDate(now), 2],
      [utcDate(startOfUtcDay(now, 1)), 1],
      [utcDate(startOfUtcDay(now, 2)), 3],
      [utcDate(startOfUtcDay(now, 29)), 4],
    ]);
    expect(clicksByDay).toEqual(
      expectedWindow(now).map((date) => ({ date, clicks: expected.get(date) ?? 0 })),
    );
    expect(clicksByDay.reduce((sum, d) => sum + d.clicks, 0)).toBe(10);
  });

  it('only counts clicks of the requested link', async () => {
    const { auth } = await createTestKey();
    const a = await createLink(auth, { url: 'https://example.com/a' });
    const b = await createLink(auth, { url: 'https://example.com/b' });
    await insertClicks(a.code, 2, { referrer: 'a.example' });
    await insertClicks(b.code, 5, { referrer: 'b.example' });

    const stats = await getStats(auth, a.code);

    expect(stats.clicksByDay.at(-1)?.clicks).toBe(2);
    expect(stats.topReferrers).toEqual([{ referrer: 'a.example', clicks: 2 }]);
  });

  it('returns at most 5 top referrers, sorted by clicks descending, with "direct" for none', async () => {
    const { auth } = await createTestKey();
    const link = await createLink(auth);
    await insertClicks(link.code, 7, { referrer: 'seven.example' });
    await insertClicks(link.code, 2, { referrer: 'two.example' });
    await insertClicks(link.code, 6, { referrer: null });
    await insertClicks(link.code, 1, { referrer: 'one.example' });
    await insertClicks(link.code, 4, { referrer: 'four.example' });
    await insertClicks(link.code, 5, { referrer: 'five.example' });
    await insertClicks(link.code, 3, { referrer: 'three.example' });

    const { topReferrers } = await getStats(auth, link.code);

    expect(topReferrers).toEqual([
      { referrer: 'seven.example', clicks: 7 },
      { referrer: 'direct', clicks: 6 },
      { referrer: 'five.example', clicks: 5 },
      { referrer: 'four.example', clicks: 4 },
      { referrer: 'three.example', clicks: 3 },
    ]);
  });

  it("returns 404 for another key's link", async () => {
    const owner = await createTestKey('owner');
    const other = await createTestKey('other');
    const link = await createLink(owner.auth);

    const res = await api().get(`/api/links/${link.code}/stats`).set(other.auth);

    expectError(res, 404, 'NOT_FOUND');
  });

  it('returns 404 for an unknown code', async () => {
    const { auth } = await createTestKey();

    expectError(await api().get('/api/links/nope123/stats').set(auth), 404, 'NOT_FOUND');
  });
});
