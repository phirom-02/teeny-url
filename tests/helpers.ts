import { asc, eq } from 'drizzle-orm';
import type { Express } from 'express';
import supertest from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.ts';
import { db } from '../src/db/client.ts';
import { type ApiKeyRow, type ClickRow, clicks, links } from '../src/db/schema.ts';
import { ErrorResponse } from '../src/schemas/common.ts';
import { Link } from '../src/schemas/links.ts';
import { createApiKey } from '../src/services/api-keys.service.ts';

export const BASE_URL = 'http://localhost:3000';

export type AuthHeaders = { Authorization: string };

let app: Express | undefined;

/** A supertest agent bound to a (lazily created, shared per file) app instance. */
export function api() {
  app ??= createApp();
  return supertest(app);
}

export interface TestKey {
  key: string;
  apiKey: ApiKeyRow;
  auth: AuthHeaders;
}

/** Creates a real API key in the test DB and returns ready-to-use auth headers. */
export async function createTestKey(name = 'test'): Promise<TestKey> {
  const { key, apiKey } = await createApiKey(name);
  return { key, apiKey, auth: { Authorization: `Bearer ${key}` } };
}

/** Creates a link through the API and asserts it succeeded. */
export async function createLink(
  auth: AuthHeaders,
  body: { url: string; alias?: string } = { url: 'https://example.com/some/path' },
): Promise<Link> {
  const res = await api().post('/api/links').set(auth).send(body);
  expect(res.status, `POST /api/links failed: ${JSON.stringify(res.body)}`).toBe(201);
  return Link.parse(res.body);
}

/** Asserts the response is an error in the standard envelope with the given status and code. */
export function expectError(res: supertest.Response, status: number, code: string) {
  expect(res.status, `unexpected body: ${JSON.stringify(res.body)}`).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({
    error: expect.objectContaining({ code, message: expect.any(String) }),
  });
  // The body must also satisfy the published zod contract (known code, nothing extra on top).
  expect(() => ErrorResponse.parse(res.body)).not.toThrow();
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Asserts a 400 VALIDATION_ERROR and returns its `details` (an array of `{ path, message }`). */
export function expectValidationError(res: supertest.Response): ValidationIssue[] {
  expectError(res, 400, 'VALIDATION_ERROR');
  const details: unknown = res.body.error.details;
  expect(Array.isArray(details), 'validation details must be an array').toBe(true);
  for (const issue of details as unknown[]) {
    expect(issue).toEqual(
      expect.objectContaining({ path: expect.any(String), message: expect.any(String) }),
    );
  }
  return details as ValidationIssue[];
}

async function linkIdFor(code: string): Promise<string> {
  const [row] = await db.select({ id: links.id }).from(links).where(eq(links.code, code));
  if (!row) throw new Error(`No link with code "${code}"`);
  return row.id;
}

/** Inserts click rows directly (bypassing the redirect) — for deterministic stats tests. */
export async function insertClicks(
  code: string,
  count: number,
  opts: { clickedAt?: Date; referrer?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  if (count <= 0) return;
  const linkId = await linkIdFor(code);
  await db.insert(clicks).values(
    Array.from({ length: count }, () => ({
      linkId,
      clickedAt: opts.clickedAt ?? new Date(),
      referrer: opts.referrer ?? null,
      userAgent: opts.userAgent ?? null,
    })),
  );
}

/** All click rows recorded for a link, oldest first. */
export async function clickRowsFor(code: string): Promise<ClickRow[]> {
  const linkId = await linkIdFor(code);
  return db.select().from(clicks).where(eq(clicks.linkId, linkId)).orderBy(asc(clicks.id));
}

/** Overrides a link's `created_at` (for deterministic ordering tests). */
export async function setLinkCreatedAt(code: string, createdAt: Date): Promise<void> {
  await db.update(links).set({ createdAt }).where(eq(links.code, code));
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of a date in UTC. */
export function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Midnight UTC of the day `daysAgo` days before `from`. */
export function startOfUtcDay(from: Date, daysAgo = 0): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - daysAgo));
}
