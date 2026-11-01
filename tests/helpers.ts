import { asc, eq } from 'drizzle-orm';
import type { Express, RequestHandler } from 'express';
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

/** A supertest agent bound to a (lazily created, shared per file) API-only app instance. */
export function api() {
  app ??= createApp();
  return supertest(app);
}

/** What the UI stub saw — proves which requests reach the UI and that their bodies arrive unread. */
export interface UiEcho {
  method: string;
  /** `req.originalUrl` as the UI handler received it. */
  url: string;
  /** The raw request body, read by the stub itself from the request stream. */
  body: string;
  /** True if something in front of the UI handler had already drained the request stream. */
  bodyConsumed: boolean;
}

/** Marker embedded in every page the UI stub renders. */
export const UI_STUB_MARKER = 'teeny-ui-stub';

const UI_ECHO_PATTERN = new RegExp(
  `<script type="application/json" id="${UI_STUB_MARKER}">(.*?)</script>`,
  's',
);

/**
 * Stand-in for SvelteKit's adapter-node handler (not a mock of our code). Like SvelteKit, it reads
 * the raw request body from the stream itself, then answers `200 text/html` with a page echoing the
 * method, original URL and body. It sets no CSP header: SvelteKit sets its own.
 */
export const uiStub: RequestHandler = (req, res) => {
  const reply = (body: string, bodyConsumed: boolean) => {
    const echo: UiEcho = { method: req.method, url: req.originalUrl, body, bodyConsumed };
    const json = JSON.stringify(echo).replaceAll('<', '\\u003c');
    res
      .status(200)
      .type('html')
      .send(
        `<!doctype html><title>UI</title><script type="application/json" id="${UI_STUB_MARKER}">${json}</script>`,
      );
  };

  // A body parser in front of us would have drained the stream; waiting for 'end' would hang.
  if (req.readableEnded) {
    reply('', true);
    return;
  }
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => reply(Buffer.concat(chunks).toString('utf8'), false));
};

let uiApp: Express | undefined;

/** A supertest agent bound to an app with the UI stub mounted (as in production with SvelteKit). */
export function apiWithUi() {
  uiApp ??= createApp({ uiHandler: uiStub });
  return supertest(uiApp);
}

/** Asserts the response was rendered by the UI stub and returns what the stub received. */
export function expectUi(res: supertest.Response): UiEcho {
  expect(res.status, `expected the UI stub, got: ${res.text?.slice(0, 300)}`).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/html/);
  const match = UI_ECHO_PATTERN.exec(res.text ?? '');
  expect(
    match,
    `response was not rendered by the UI stub: ${res.text?.slice(0, 300)}`,
  ).not.toBeNull();
  return JSON.parse(match?.[1] ?? '{}') as UiEcho;
}

/** `Accept` headers of real browser page navigations. */
export const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,*/*;q=0.8';
export const CHROME_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';

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
