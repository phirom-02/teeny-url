import { z } from 'zod';

/** Number of days covered by `clicksByDay`, including today (UTC). */
export const STATS_DAYS = 30;
export const TOP_REFERRERS_LIMIT = 5;
/** Label used in `topReferrers` for clicks without a Referer header. */
export const DIRECT_REFERRER = 'direct';

export const LinkStats = z
  .object({
    code: z.string(),
    totalClicks: z.number().int(),
    lastClickedAt: z.iso.datetime().nullable(),
    clicksByDay: z
      .array(z.object({ date: z.iso.date(), clicks: z.number().int() }))
      .meta({ description: `Last ${STATS_DAYS} days (UTC), oldest first, zero-filled` }),
    topReferrers: z.array(z.object({ referrer: z.string(), clicks: z.number().int() })).meta({
      description: `Top ${TOP_REFERRERS_LIMIT} referrers (all time); "${DIRECT_REFERRER}" = no referrer`,
    }),
  })
  .meta({ id: 'LinkStats' });
export type LinkStats = z.infer<typeof LinkStats>;
