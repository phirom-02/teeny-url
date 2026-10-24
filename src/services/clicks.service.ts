import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { clicks, type LinkRow, links } from '../db/schema.ts';
import {
  DIRECT_REFERRER,
  type LinkStats,
  STATS_DAYS,
  TOP_REFERRERS_LIMIT,
} from '../schemas/stats.ts';

const MAX_USER_AGENT_LENGTH = 512;
/** Longest valid DNS name; caps what an arbitrary `Referer` header can make us store. */
const MAX_REFERRER_HOST_LENGTH = 253;

export interface ClickContext {
  referrer?: string;
  userAgent?: string;
}

/** Only the referrer's hostname is kept: privacy-friendly and aggregates well. */
function referrerHost(referrer: string | undefined): string | null {
  if (!referrer) return null;
  const host = URL.parse(referrer)?.hostname.toLowerCase();
  return host ? host.slice(0, MAX_REFERRER_HOST_LENGTH) : null;
}

function truncateUserAgent(userAgent: string | undefined): string | null {
  return userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null;
}

/**
 * Counts a click and returns the link's target URL, or null when the code doesn't exist.
 * The counter update and the click insert happen in one transaction.
 */
export async function recordClick(
  code: string,
  { referrer, userAgent }: ClickContext = {},
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .update(links)
      .set({ clickCount: sql`${links.clickCount} + 1`, lastClickedAt: sql`now()` })
      .where(eq(links.code, code))
      .returning({ id: links.id, targetUrl: links.targetUrl });
    if (!link) return null;

    await tx.insert(clicks).values({
      linkId: link.id,
      referrer: referrerHost(referrer),
      userAgent: truncateUserAgent(userAgent),
    });
    return link.targetUrl;
  });
}

/** Resolves a code to its target URL without recording a click (e.g. for `HEAD`). */
export async function findTarget(code: string): Promise<string | null> {
  const [row] = await db
    .select({ targetUrl: links.targetUrl })
    .from(links)
    .where(eq(links.code, code))
    .limit(1);
  return row?.targetUrl ?? null;
}

type CountRow = { clicks: number | string };

export async function getLinkStats(link: LinkRow): Promise<LinkStats> {
  const [byDay, referrers] = await Promise.all([
    // One row per UTC day for the last STATS_DAYS days (today included), zero-filled.
    // Clicks are pre-filtered with a sargable range on (link_id, clicked_at) before bucketing.
    db.execute<CountRow & { date: string }>(sql`
      WITH bounds AS (
        SELECT (now() AT TIME ZONE 'UTC')::date AS today
      ),
      days AS (
        SELECT b.today - g.n AS day
        FROM bounds b, generate_series(${STATS_DAYS - 1}::int, 0, -1) AS g(n)
      ),
      daily AS (
        SELECT (c.clicked_at AT TIME ZONE 'UTC')::date AS day, count(*) AS clicks
        FROM ${clicks} c, bounds b
        WHERE c.link_id = ${link.id}::uuid
          AND c.clicked_at >= ((b.today - ${STATS_DAYS - 1}::int)::timestamp AT TIME ZONE 'UTC')
        GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date, coalesce(daily.clicks, 0) AS clicks
      FROM days d
      LEFT JOIN daily ON daily.day = d.day
      ORDER BY d.day
    `),
    // Grouping by the coalesced label (ordinal 1) merges NULL with a literal "direct" host.
    // COLLATE "C" makes the tie-break a plain byte order, independent of the database locale.
    db.execute<CountRow & { referrer: string }>(sql`
      SELECT coalesce(referrer, ${DIRECT_REFERRER}::text) COLLATE "C" AS referrer,
             count(*) AS clicks
      FROM ${clicks}
      WHERE link_id = ${link.id}::uuid
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
      LIMIT ${TOP_REFERRERS_LIMIT}::int
    `),
  ]);

  return {
    code: link.code,
    totalClicks: link.clickCount,
    lastClickedAt: link.lastClickedAt?.toISOString() ?? null,
    clicksByDay: byDay.rows.map((r) => ({ date: r.date, clicks: Number(r.clicks) })),
    topReferrers: referrers.rows.map((r) => ({ referrer: r.referrer, clicks: Number(r.clicks) })),
  };
}
