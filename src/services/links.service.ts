import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { type LinkRow, links } from '../db/schema.ts';
import { env } from '../env.ts';
import { AppError } from '../lib/errors.ts';
import { generateShortCode } from '../lib/short-code.ts';
import { isSelfReferential } from '../lib/url.ts';
import type { CreateLinkBody, Link, ListLinksQuery } from '../schemas/links.ts';

/** Generated-code collisions are astronomically rare; this only guards against a hot loop. */
const MAX_CODE_ATTEMPTS = 5;
const PG_UNIQUE_VIOLATION = '23505';

function propOf(value: unknown, key: 'code' | 'cause'): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<typeof key, unknown>)[key]
    : undefined;
}

/** Detects a Postgres unique violation, whether raw from `pg` or wrapped by Drizzle (`.cause`). */
function isUniqueViolation(err: unknown): boolean {
  return (
    propOf(err, 'code') === PG_UNIQUE_VIOLATION ||
    propOf(propOf(err, 'cause'), 'code') === PG_UNIQUE_VIOLATION
  );
}

function linkNotFound(): AppError {
  return new AppError('NOT_FOUND', 'Link not found');
}

function ownedBy(apiKeyId: string, code: string) {
  return and(eq(links.code, code), eq(links.apiKeyId, apiKeyId));
}

async function insertLink(values: typeof links.$inferInsert): Promise<LinkRow> {
  const [row] = await db.insert(links).values(values).returning();
  if (!row) throw new Error('INSERT ... RETURNING returned no row');
  return row;
}

/** Serializes a DB row into the public `Link` contract. */
export function toLink(row: LinkRow): Link {
  return {
    code: row.code,
    shortUrl: `${env.BASE_URL}/${row.code}`,
    targetUrl: row.targetUrl,
    isCustom: row.isCustom,
    clickCount: row.clickCount,
    lastClickedAt: row.lastClickedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createLink(apiKeyId: string, input: CreateLinkBody): Promise<LinkRow> {
  if (isSelfReferential(input.url)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid request', [
      { path: 'url', message: 'URL must not point to this service' },
    ]);
  }

  if (input.alias !== undefined) {
    try {
      return await insertLink({
        apiKeyId,
        code: input.alias,
        targetUrl: input.url,
        isCustom: true,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('ALIAS_TAKEN', `Alias "${input.alias}" is already taken`);
      }
      throw err;
    }
  }

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await insertLink({ apiKeyId, code: generateShortCode(), targetUrl: input.url });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError('INTERNAL_ERROR', 'Could not allocate a short code');
}

/** The caller's links, newest first. */
export async function listLinks(
  apiKeyId: string,
  { limit, offset }: ListLinksQuery,
): Promise<{ rows: LinkRow[]; total: number }> {
  const byKey = eq(links.apiKeyId, apiKeyId);
  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(links)
      .where(byKey)
      .orderBy(desc(links.createdAt), desc(links.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(links).where(byKey),
  ]);
  return { rows, total: totals?.total ?? 0 };
}

/** A link owned by `apiKeyId`. Missing and foreign-owned links are both `NOT_FOUND`. */
export async function getOwnedLink(apiKeyId: string, code: string): Promise<LinkRow> {
  const [row] = await db.select().from(links).where(ownedBy(apiKeyId, code)).limit(1);
  if (!row) throw linkNotFound();
  return row;
}

/** Deletes a link owned by `apiKeyId` (its clicks cascade). Same `NOT_FOUND` rules as above. */
export async function deleteLink(apiKeyId: string, code: string): Promise<void> {
  const deleted = await db.delete(links).where(ownedBy(apiKeyId, code)).returning({ id: links.id });
  if (deleted.length === 0) throw linkNotFound();
}
