import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** First characters of the key, safe to display (e.g. `tny_AbCd1234`). */
  prefix: text('prefix').notNull(),
  /** SHA-256 hex digest of the full key. The plaintext key is never stored. */
  keyHash: text('key_hash').notNull().unique(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  lastUsedAt: timestamptz('last_used_at'),
  revokedAt: timestamptz('revoked_at'),
});

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    targetUrl: text('target_url').notNull(),
    isCustom: boolean('is_custom').notNull().default(false),
    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    clickCount: integer('click_count').notNull().default(0),
    lastClickedAt: timestamptz('last_clicked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('links_api_key_id_created_at_idx').on(t.apiKeyId, t.createdAt.desc())],
);

export const clicks = pgTable(
  'clicks',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    clickedAt: timestamptz('clicked_at').notNull().defaultNow(),
    referrer: text('referrer'),
    userAgent: text('user_agent'),
  },
  (t) => [index('clicks_link_id_clicked_at_idx').on(t.linkId, t.clickedAt)],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type LinkRow = typeof links.$inferSelect;
export type ClickRow = typeof clicks.$inferSelect;
