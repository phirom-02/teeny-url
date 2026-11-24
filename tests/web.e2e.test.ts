import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { SESSION_COOKIE, SESSION_MAX_AGE_S } from '../src/lib/cookies.ts';
import { createUiHandler } from '../src/middleware/ui-static.ts';
import { MeResponse } from '../src/schemas/keys.ts';
import { type Link, LinkList } from '../src/schemas/links.ts';
import { revokeApiKey } from '../src/services/api-keys.service.ts';
import { type AuthHeaders, api, BROWSER_ACCEPT, createTestKey, expectError } from './helpers.ts';

/**
 * End to end against the REAL built React SPA (`web/dist`) mounted in `createApp` via
 * `createUiHandler`: static asset serving, SPA fallback status codes, strict UI CSP, browser
 * session cookies (`POST`/`DELETE /api/session`), cookie-authenticated API calls, and same-origin
 * CSRF protection all run for real over HTTP.
 */

const DIST_DIR = fileURLToPath(new URL('../web/dist', import.meta.url));
const BUILT = existsSync(path.join(DIST_DIR, 'index.html'));

if (!BUILT) {
  process.stderr.write('[web.e2e] skipped: web/dist is missing — run `pnpm build` first\n');
}

const KEY_NAME = 'E2E Browser Key';
const TARGET = 'https://example.com/e2e/landing?from=teeny';
const EVIL_ORIGIN = 'https://evil.example';

interface ParsedCookie {
  value: string;
  attributes: Map<string, string | true>;
}

/** The `teeny_key` cookie from a response's `Set-Cookie` headers, if any. */
function sessionCookie(res: supertest.Response): ParsedCookie | undefined {
  const header: unknown = res.headers['set-cookie'];
  const lines = Array.isArray(header) ? (header as string[]) : header ? [String(header)] : [];
  const line = lines.find((l) => l.startsWith(`${SESSION_COOKIE}=`));
  if (line === undefined) return undefined;

  const [pair = '', ...attrs] = line.split(';').map((part) => part.trim());
  const attributes = new Map<string, string | true>();
  for (const attr of attrs) {
    const eq = attr.indexOf('=');
    if (eq === -1) attributes.set(attr.toLowerCase(), true);
    else attributes.set(attr.slice(0, eq).toLowerCase(), attr.slice(eq + 1));
  }
  return { value: decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1)), attributes };
}

/** Asserts the response deletes the session cookie on `Path=/`. */
function expectSessionCleared(res: supertest.Response) {
  const cookie = sessionCookie(res);
  expect(cookie, `expected a Set-Cookie clearing ${SESSION_COOKIE}`).toBeDefined();
  if (!cookie) return;
  expect(cookie.value).toBe('');
  const maxAge = cookie.attributes.get('max-age');
  const expires = cookie.attributes.get('expires');
  const expired =
    maxAge === '0' || (typeof expires === 'string' && Date.parse(expires) < Date.now());
  expect(expired, `cookie is not expired: ${JSON.stringify([...cookie.attributes])}`).toBe(true);
  expect(cookie.attributes.get('path')).toBe('/');
}

/** Asserts a body never contains the plaintext key — neither whole nor its secret suffix. */
function expectNoKey(body: string, key: string) {
  expect(body.includes(key), 'the plaintext API key leaked into the response').toBe(false);
  expect(body.includes(key.slice(12)), 'the secret part of the API key leaked').toBe(false);
}

/** The key's links, newest first, read through the JSON API. */
async function linksOf(auth: AuthHeaders): Promise<Link[]> {
  const res = await api().get('/api/links').set(auth);
  expect(res.status).toBe(200);
  return LinkList.parse(res.body).data;
}

describe.skipIf(!BUILT)(
  BUILT ? 'web UI end to end (real React build)' : 'web UI end to end — run `pnpm build`',
  { timeout: 20_000 },
  () => {
    let server: Server | undefined;
    let origin = '';

    beforeAll(async () => {
      const app = createApp({ uiHandler: createUiHandler(DIST_DIR) });
      const listening = createServer(app);
      server = listening;
      await new Promise<void>((resolve, reject) => {
        listening.once('error', reject);
        listening.listen(0, '127.0.0.1', () => resolve());
      });
      const { port } = listening.address() as AddressInfo;
      origin = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
      if (!server) return;
      const closing = server;
      await new Promise<void>((resolve) => {
        closing.close(() => resolve());
        closing.closeAllConnections();
      });
    });

    function http() {
      return supertest(origin);
    }

    function browse(routePath: string, key?: string) {
      const req = http().get(routePath).set('Accept', BROWSER_ACCEPT);
      return key === undefined ? req : req.set('Cookie', `${SESSION_COOKIE}=${key}`);
    }

    interface SessionRequestOptions {
      key?: string;
      /** `null` omits the `Origin` header; default is this server's own origin. */
      origin?: string | null;
    }

    function cookiePost(routePath: string, body: unknown, opts: SessionRequestOptions = {}) {
      let req = http()
        .post(routePath)
        .send(body as object);
      const from = opts.origin === undefined ? origin : opts.origin;
      if (from !== null) req = req.set('Origin', from);
      if (opts.key !== undefined) req = req.set('Cookie', `${SESSION_COOKIE}=${opts.key}`);
      return req;
    }

    function cookieDelete(routePath: string, opts: SessionRequestOptions = {}) {
      let req = http().delete(routePath);
      const from = opts.origin === undefined ? origin : opts.origin;
      if (from !== null) req = req.set('Origin', from);
      if (opts.key !== undefined) req = req.set('Cookie', `${SESSION_COOKIE}=${opts.key}`);
      return req;
    }

    describe('SPA routes & static assets', () => {
      it.each(['/', '/login'])('GET %s → 200 HTML with strict UI CSP', async (routePath) => {
        const res = await browse(routePath);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.text).toContain('<div id="root"></div>');
        const csp = String(res.headers['content-security-policy'] ?? '');
        expect(csp).toContain("script-src 'self'");
        expect(csp).toContain("style-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).not.toContain('unsafe-inline');
        expect(csp).not.toContain("default-src 'none'");
      });

      it('serves built JS/CSS assets with immutable cache headers', async () => {
        const html = await browse('/');
        const assetMatch = /src="(\/assets\/[^"]+\.js)"/.exec(html.text);
        expect(assetMatch?.[1], 'expected bundled JS asset in index.html').toBeDefined();

        const asset = await http().get(assetMatch?.[1] ?? '');
        expect(asset.status).toBe(200);
        expect(asset.headers['cache-control']).toMatch(/immutable/);
      });

      it('serves static files (/robots.txt, /favicon.svg)', async () => {
        const robots = await http().get('/robots.txt');
        expect(robots.status).toBe(200);
        expect(robots.text).toContain('User-agent:');

        const favicon = await http().get('/favicon.svg');
        expect(favicon.status).toBe(200);
        expect(favicon.headers['content-type']).toMatch(/image\/svg\+xml/);
      });
    });

    describe('browser session lifecycle (POST / DELETE /api/session)', () => {
      it('valid key → 200 MeResponse with httpOnly, SameSite=Lax, 30-day session cookie', async () => {
        const { key, apiKey } = await createTestKey(KEY_NAME);

        const res = await cookiePost('/api/session', { key });

        expect(res.status).toBe(200);
        expect(MeResponse.parse(res.body)).toEqual({ name: KEY_NAME, prefix: apiKey.prefix });
        expectNoKey(res.text, key);
        expect(res.headers['cache-control']).toMatch(/private/);
        expect(res.headers['cache-control']).toMatch(/no-store/);

        const cookie = sessionCookie(res);
        expect(cookie, 'expected Set-Cookie: teeny_key=…').toBeDefined();
        expect(cookie?.value).toBe(key);
        expect(cookie?.attributes.get('httponly')).toBe(true);
        expect(String(cookie?.attributes.get('samesite')).toLowerCase()).toBe('lax');
        expect(cookie?.attributes.get('path')).toBe('/');
        expect(cookie?.attributes.get('max-age')).toBe(String(SESSION_MAX_AGE_S));
        expect(cookie?.attributes.has('secure')).toBe(false);
      });

      it('ignores surrounding whitespace in the pasted key', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await cookiePost('/api/session', { key: `  ${key}\n` });

        expect(res.status).toBe(200);
        expect(sessionCookie(res)?.value).toBe(key);
      });

      it('unknown key → 401 UNAUTHORIZED, no cookie, and key is never echoed', async () => {
        await createTestKey(KEY_NAME);
        const unknown = `tny_${'A'.repeat(32)}`;

        const res = await cookiePost('/api/session', { key: unknown });

        expectError(res, 401, 'UNAUTHORIZED');
        expect(sessionCookie(res)).toBeUndefined();
        expect(res.text).not.toContain(unknown);
      });

      it('revoked key → 401 UNAUTHORIZED, no cookie', async () => {
        const { key, apiKey } = await createTestKey(KEY_NAME);
        await revokeApiKey(apiKey.id);

        const res = await cookiePost('/api/session', { key });

        expectError(res, 401, 'UNAUTHORIZED');
        expect(sessionCookie(res)).toBeUndefined();
        expectNoKey(res.text, key);
      });

      it('empty key → 400 VALIDATION_ERROR, no cookie', async () => {
        const res = await cookiePost('/api/session', { key: '   ' });

        expectError(res, 400, 'VALIDATION_ERROR');
        expect(sessionCookie(res)).toBeUndefined();
      });

      it('DELETE /api/session → 204 and clears the session cookie', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await cookieDelete('/api/session', { key });

        expect(res.status).toBe(204);
        expectSessionCleared(res);
      });
    });

    describe('CSRF protection on session & cookie-authenticated mutations', () => {
      it('rejects cross-origin POST /api/session with 403 FORBIDDEN', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await cookiePost('/api/session', { key }, { origin: EVIL_ORIGIN });

        expectError(res, 403, 'FORBIDDEN');
        expect(sessionCookie(res)).toBeUndefined();
      });

      it('rejects POST /api/session without an Origin header with 403 FORBIDDEN', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await cookiePost('/api/session', { key }, { origin: null });

        expectError(res, 403, 'FORBIDDEN');
        expect(sessionCookie(res)).toBeUndefined();
      });

      it('rejects cross-origin DELETE /api/session with 403 FORBIDDEN', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await cookieDelete('/api/session', { key, origin: EVIL_ORIGIN });

        expectError(res, 403, 'FORBIDDEN');
        expect(sessionCookie(res)).toBeUndefined();
      });

      it('rejects cross-origin cookie-authenticated POST /api/links with 403 FORBIDDEN', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await cookiePost('/api/links', { url: TARGET }, { key, origin: EVIL_ORIGIN });

        expectError(res, 403, 'FORBIDDEN');
        expect(await linksOf(auth)).toHaveLength(0);
      });

      it('rejects cookie-authenticated POST /api/links without Origin with 403 FORBIDDEN', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await cookiePost('/api/links', { url: TARGET }, { key, origin: null });

        expectError(res, 403, 'FORBIDDEN');
        expect(await linksOf(auth)).toHaveLength(0);
      });

      it('rejects cross-origin cookie-authenticated DELETE /api/links/:code with 403 FORBIDDEN', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);
        const created = await api().post('/api/links').set(auth).send({ url: TARGET });
        expect(created.status).toBe(201);

        const res = await cookieDelete(`/api/links/${created.body.code}`, {
          key,
          origin: EVIL_ORIGIN,
        });

        expectError(res, 403, 'FORBIDDEN');
        expect(await linksOf(auth)).toHaveLength(1);
      });
    });

    describe('cookie-authenticated API flows', () => {
      it('GET /api/me with valid session cookie → 200 MeResponse, never leaks key, not cacheable', async () => {
        const { key, apiKey } = await createTestKey(KEY_NAME);

        const res = await http().get('/api/me').set('Cookie', `${SESSION_COOKIE}=${key}`);

        expect(res.status).toBe(200);
        expect(MeResponse.parse(res.body)).toEqual({ name: KEY_NAME, prefix: apiKey.prefix });
        expectNoKey(res.text, key);
        expect(res.headers['cache-control']).toMatch(/private/);
        expect(res.headers['cache-control']).toMatch(/no-store/);
      });

      it('same-origin cookie-authenticated shorten + list works end to end', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const created = await cookiePost(
          '/api/links',
          { url: TARGET, alias: 'e2e-react' },
          { key },
        );

        expect(created.status).toBe(201);
        expect(created.body.code).toBe('e2e-react');
        expectNoKey(created.text, key);

        const listed = await http()
          .get('/api/links?limit=5')
          .set('Cookie', `${SESSION_COOKIE}=${key}`);

        expect(listed.status).toBe(200);
        expect(LinkList.parse(listed.body).data.map((l) => l.code)).toEqual(['e2e-react']);
        expect(await linksOf(auth)).toHaveLength(1);
      });

      it('duplicate alias via cookie → 409 ALIAS_TAKEN', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);
        await api().post('/api/links').set(auth).send({ url: TARGET, alias: 'e2e-dupe' });

        const res = await cookiePost('/api/links', { url: TARGET, alias: 'e2e-dupe' }, { key });

        expectError(res, 409, 'ALIAS_TAKEN');
        expect(await linksOf(auth)).toHaveLength(1);
      });

      it('revoked key cookie → 401 UNAUTHORIZED and clears the cookie', async () => {
        const { key, apiKey } = await createTestKey(KEY_NAME);
        await revokeApiKey(apiKey.id);

        const res = await http().get('/api/me').set('Cookie', `${SESSION_COOKIE}=${key}`);

        expectError(res, 401, 'UNAUTHORIZED');
        expectSessionCleared(res);
      });

      it('malformed session cookie → 401 UNAUTHORIZED and clears the cookie', async () => {
        const res = await http()
          .get('/api/me')
          .set('Cookie', `${SESSION_COOKIE}=${encodeURIComponent('bad key\twith spaces')}`);

        expectError(res, 401, 'UNAUTHORIZED');
        expectSessionCleared(res);
      });
    });

    describe('security headers & unknown short codes', () => {
      const UNKNOWN_CODE = 'zzzzzzz';

      it('JSON /api keeps the strict default-src none CSP', async () => {
        const res = await http().get('/api');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      });

      it('a browser requesting an unknown short code gets the UI HTML with HTTP 404', async () => {
        const res = await browse(`/${UNKNOWN_CODE}`);

        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('<div id="root"></div>');
        expect(res.headers['content-security-policy']).toContain("script-src 'self'");
      });

      it.each([
        ['no Accept header', undefined],
        ['Accept: */*', '*/*'],
      ])('curl (%s) gets JSON 404 "Link not found"', async (_label, accept) => {
        const req = http().get(`/${UNKNOWN_CODE}`);

        const res = await (accept === undefined ? req : req.set('Accept', accept));

        expectError(res, 404, 'NOT_FOUND');
        expect(res.body.error.message).toBe('Link not found');
      });

      it('a known code still redirects a browser (302, not the UI)', async () => {
        const { auth } = await createTestKey(KEY_NAME);
        const created = await api().post('/api/links').set(auth).send({ url: TARGET });
        expect(created.status).toBe(201);

        const res = await browse(`/${created.body.code}`);

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(TARGET);
      });
    });
  },
);
