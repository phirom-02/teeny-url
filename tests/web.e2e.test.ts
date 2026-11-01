import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RequestHandler } from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { type Link, LinkList } from '../src/schemas/links.ts';
import { revokeApiKey } from '../src/services/api-keys.service.ts';
import { type AuthHeaders, api, BROWSER_ACCEPT, createTestKey, expectError } from './helpers.ts';

/**
 * End to end against the REAL SvelteKit build (`web/build`, adapter-node) mounted in `createApp`:
 * the session hook, cookies, form actions, CSRF and CSP all run for real. The UI's server code calls
 * the API back over HTTP (`API_ORIGIN`), so the app listens on a real loopback port.
 *
 * Assertions stick to behaviour (statuses, headers, cookies, presence of data) — not markup.
 */

const HANDLER_PATH = fileURLToPath(new URL('../web/build/handler.js', import.meta.url));
const BUILT = existsSync(HANDLER_PATH);

if (!BUILT) {
  // Not console.warn: vitest hides console output from files whose tests were all skipped.
  process.stderr.write('[web.e2e] skipped: web/build is missing — run `pnpm build` first\n');
}

const SESSION_COOKIE = 'teeny_key';
const THIRTY_DAYS_S = 60 * 60 * 24 * 30;
const KEY_NAME = 'E2E Browser Key';
const TARGET = 'https://example.com/e2e/landing?from=teeny';
const EVIL_ORIGIN = 'https://evil.example';

interface ParsedCookie {
  value: string;
  /** Attribute names lowercased; flag attributes (`HttpOnly`) map to `true`. */
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

/** Asserts the response deletes the session cookie (on the path it was set with). */
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
  // A deletion only replaces the original cookie if it targets the same path.
  expect(cookie.attributes.get('path')).toBe('/');
}

/** `script-src` of a Content-Security-Policy header. */
function scriptSrc(csp: string): string {
  return (
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src ')) ?? ''
  );
}

/** Asserts a body never contains the plaintext key — not whole, nor its secret part. */
function expectNoKey(body: string, key: string) {
  expect(body.includes(key), 'the plaintext API key leaked into the response').toBe(false);
  // The 12-character display prefix (`tny_AbCd1234`) may be shown; what follows must never be.
  expect(body.includes(key.slice(12)), 'the secret part of the API key leaked').toBe(false);
}

/** The key's links, newest first, read through the JSON API. */
async function linksOf(auth: AuthHeaders): Promise<Link[]> {
  const res = await api().get('/api/links').set(auth);
  expect(res.status).toBe(200);
  return LinkList.parse(res.body).data;
}

describe.skipIf(!BUILT)(
  BUILT ? 'web UI end to end (real SvelteKit build)' : 'web UI end to end — run `pnpm build`',
  { timeout: 20_000 },
  () => {
    let server: Server | undefined;
    let svelteKit: RequestHandler | undefined;
    let origin = '';

    const UI_ENV = ['API_ORIGIN', 'PROTOCOL_HEADER', 'ADDRESS_HEADER', 'XFF_DEPTH'] as const;
    const savedEnv = new Map(UI_ENV.map((name) => [name, process.env[name]]));

    beforeAll(async () => {
      // The handler is bound late: SvelteKit snapshots process.env when its module loads, and
      // API_ORIGIN must point at this server's port, known only once it listens.
      const app = createApp({
        uiHandler: (req, res, next) => {
          if (!svelteKit) {
            next(new Error('SvelteKit handler not loaded'));
            return;
          }
          svelteKit(req, res, next);
        },
      });
      const listening = createServer(app);
      server = listening;
      await new Promise<void>((resolve, reject) => {
        listening.once('error', reject);
        listening.listen(0, '127.0.0.1', () => resolve());
      });
      const { port } = listening.address() as AddressInfo;
      origin = `http://127.0.0.1:${port}`;

      // As src/server.ts configures adapter-node.
      process.env.API_ORIGIN = origin;
      process.env.PROTOCOL_HEADER = 'x-forwarded-proto';
      process.env.ADDRESS_HEADER = 'x-forwarded-for';
      process.env.XFF_DEPTH = '1';

      const mod = (await import(pathToFileURL(HANDLER_PATH).href)) as { handler: RequestHandler };
      svelteKit = mod.handler;
    }, 60_000);

    afterAll(async () => {
      if (server) {
        const closing = server;
        await new Promise<void>((resolve) => {
          closing.close(() => resolve());
          closing.closeAllConnections();
        });
      }
      for (const [name, value] of savedEnv) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });

    /** Over real HTTP: the UI calls the API back at the same origin. */
    function http() {
      return supertest(origin);
    }

    /** A browser page navigation, optionally signed in with `key`. */
    function browse(path: string, key?: string) {
      const req = http().get(path).set('Accept', BROWSER_ACCEPT);
      return key === undefined ? req : req.set('Cookie', `${SESSION_COOKIE}=${key}`);
    }

    interface FormPostOptions {
      key?: string;
      /** `null` sends no `Origin` header; default: this server's own origin. */
      origin?: string | null;
      /** `html` = a plain form post; `json` = a SvelteKit-enhanced one. */
      accept?: 'html' | 'json';
    }

    /** A form POST as a browser sends it (urlencoded), by default same-origin and plain. */
    function formPost(path: string, fields: Record<string, string>, opts: FormPostOptions = {}) {
      let req = http()
        .post(path)
        .set('Accept', opts.accept === 'json' ? 'application/json' : BROWSER_ACCEPT)
        .type('form')
        .send(new URLSearchParams(fields).toString());
      const from = opts.origin === undefined ? origin : opts.origin;
      if (from !== null) req = req.set('Origin', from);
      if (opts.accept === 'json') req = req.set('x-sveltekit-action', 'true');
      if (opts.key !== undefined) req = req.set('Cookie', `${SESSION_COOKIE}=${opts.key}`);
      return req;
    }

    describe('signing in', () => {
      it('GET / signed out → 303 to /login', async () => {
        const res = await browse('/');

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/login');
      });

      it('GET /login signed out → 200 HTML', async () => {
        const res = await browse('/login');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(sessionCookie(res)).toBeUndefined();
      });

      it('a valid key → 303 to / with an httpOnly, SameSite=Lax, 30-day session cookie', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await formPost('/login', { key });

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/');
        const cookie = sessionCookie(res);
        expect(cookie, 'expected Set-Cookie: teeny_key=…').toBeDefined();
        expect(cookie?.value).toBe(key);
        expect(cookie?.attributes.get('httponly')).toBe(true);
        expect(String(cookie?.attributes.get('samesite')).toLowerCase()).toBe('lax');
        expect(cookie?.attributes.get('path')).toBe('/');
        expect(cookie?.attributes.get('max-age')).toBe(String(THIRTY_DAYS_S));
        // Plain http: a `Secure` cookie would never be sent back.
        expect(cookie?.attributes.has('secure')).toBe(false);
      });

      it('surrounding whitespace in the pasted key is ignored', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await formPost('/login', { key: `  ${key}\n` });

        expect(res.status).toBe(303);
        expect(sessionCookie(res)?.value).toBe(key);
      });

      it('an unknown key → 400, no session cookie, and the key is not echoed back', async () => {
        await createTestKey(KEY_NAME);
        const unknown = `tny_${'A'.repeat(32)}`;

        const res = await formPost('/login', { key: unknown });

        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(sessionCookie(res)).toBeUndefined();
        expect(res.text).not.toContain(unknown);
      });

      it('a revoked key cannot sign in → 400, no session cookie', async () => {
        const { key, apiKey } = await createTestKey(KEY_NAME);
        await revokeApiKey(apiKey.id);

        const res = await formPost('/login', { key });

        expect(res.status).toBe(400);
        expect(sessionCookie(res)).toBeUndefined();
        expectNoKey(res.text, key);
      });

      it('an empty key → 400, no session cookie', async () => {
        const res = await formPost('/login', { key: '' });

        expect(res.status).toBe(400);
        expect(sessionCookie(res)).toBeUndefined();
      });

      it('GET /login signed in → 303 to /', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await browse('/login', key);

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/');
      });
    });

    describe('CSRF: SvelteKit rejects form posts not from its own origin', () => {
      it.each(['/', '/login', '/logout'])('cross-origin POST %s → 403', async (path) => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await formPost(path, { key, url: TARGET }, { key, origin: EVIL_ORIGIN });

        expect(res.status).toBe(403);
        // The action never ran: no session set or cleared, no link created.
        expect(sessionCookie(res)).toBeUndefined();
        expect(await linksOf(auth)).toHaveLength(0);
      });

      it.each(['/', '/login', '/logout'])(
        'POST %s without an Origin header → 403',
        async (path) => {
          const { key, auth } = await createTestKey(KEY_NAME);

          const res = await formPost(path, { key, url: TARGET }, { key, origin: null });

          expect(res.status).toBe(403);
          expect(sessionCookie(res)).toBeUndefined();
          expect(await linksOf(auth)).toHaveLength(0);
        },
      );

      it('an enhanced (Accept: application/json) cross-origin POST / → 403', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await formPost(
          '/',
          { url: TARGET },
          { key, origin: EVIL_ORIGIN, accept: 'json' },
        );

        expect(res.status).toBe(403);
        expect(await linksOf(auth)).toHaveLength(0);
      });
    });

    describe('signed in', () => {
      it('GET / → 200 HTML with the key name, never the key, and not cacheable', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await browse('/', key);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain(KEY_NAME);
        expectNoKey(res.text, key);
        expect(res.headers['cache-control']).toMatch(/private/);
        expect(res.headers['cache-control']).toMatch(/no-store/);
        // A valid session is left alone.
        expect(sessionCookie(res)).toBeUndefined();
      });

      it("GET / lists the key's recent links", async () => {
        const { key, auth } = await createTestKey(KEY_NAME);
        const created = await api().post('/api/links').set(auth).send({ url: TARGET });
        expect(created.status).toBe(201);

        const res = await browse('/', key);

        expect(res.status).toBe(200);
        expect(res.text).toContain(created.body.code);
      });

      it('GET /__data.json → the key name, never the key', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await http()
          .get('/__data.json')
          .set('Accept', '*/*')
          .set('Cookie', `${SESSION_COOKIE}=${key}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.text).toContain(KEY_NAME);
        expectNoKey(res.text, key);
      });

      it('enhanced shorten (Accept: application/json) → action JSON with the code, never the key', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await formPost('/', { url: TARGET, alias: '' }, { key, accept: 'json' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body.type).toBe('success');
        const [link] = await linksOf(auth);
        expect(link?.targetUrl).toBe(TARGET);
        expect(res.text).toContain(link?.code);
        expectNoKey(res.text, key);
      });

      it('plain-form shorten → 200 HTML showing the new short link', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await formPost('/', { url: TARGET, alias: '' }, { key });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        const links = await linksOf(auth);
        expect(links).toHaveLength(1);
        expect(links[0]?.targetUrl).toBe(TARGET);
        expect(res.text).toContain(links[0]?.shortUrl);
        expectNoKey(res.text, key);
      });

      it('plain-form shorten with an alias → 200 and the alias link is created', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await formPost('/', { url: TARGET, alias: 'e2e-promo' }, { key });

        expect(res.status).toBe(200);
        const links = await linksOf(auth);
        expect(links.map((l) => l.code)).toEqual(['e2e-promo']);
        expect(res.text).toContain(links[0]?.shortUrl);
      });

      it('a duplicate alias → 409 with the "already taken" message', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);
        const first = await api()
          .post('/api/links')
          .set(auth)
          .send({ url: TARGET, alias: 'e2e-dupe' });
        expect(first.status).toBe(201);

        const res = await formPost('/', { url: TARGET, alias: 'e2e-dupe' }, { key });

        expect(res.status).toBe(409);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toMatch(/already taken/i);
        expect(await linksOf(auth)).toHaveLength(1);
      });

      it('an invalid URL → 400 and nothing is created', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await formPost('/', { url: 'not a url', alias: '' }, { key });

        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(await linksOf(auth)).toHaveLength(0);
      });

      it('a missing URL → 400 and nothing is created', async () => {
        const { key, auth } = await createTestKey(KEY_NAME);

        const res = await formPost('/', { url: '   ', alias: '' }, { key });

        expect(res.status).toBe(400);
        expect(await linksOf(auth)).toHaveLength(0);
      });

      it('a revoked key → GET / is 303 to /login and the cookie is cleared', async () => {
        const { key, apiKey } = await createTestKey(KEY_NAME);
        await revokeApiKey(apiKey.id);

        const res = await browse('/', key);

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/login');
        expectSessionCleared(res);
      });

      it('a key revoked after the page loaded → shorten is 303 to /login, cookie cleared', async () => {
        const { key, apiKey } = await createTestKey(KEY_NAME);
        expect((await browse('/', key)).status).toBe(200);
        await revokeApiKey(apiKey.id);

        const res = await formPost('/', { url: TARGET, alias: '' }, { key });

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/login');
        expectSessionCleared(res);
      });

      it('a malformed session cookie is cleared → GET / is 303 to /login', async () => {
        const res = await http()
          .get('/')
          .set('Accept', BROWSER_ACCEPT)
          .set('Cookie', `${SESSION_COOKIE}=${encodeURIComponent('bad key\twith spaces')}`);

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/login');
        expectSessionCleared(res);
      });

      it('logout (same-origin form POST) → 303 to /login and the cookie is cleared', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await formPost('/logout', {}, { key });

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/login');
        expectSessionCleared(res);
      });
    });

    describe('security headers', () => {
      it('UI pages carry SvelteKit’s nonce-based CSP, not the strict JSON one', async () => {
        const res = await browse('/login');

        expect(res.status).toBe(200);
        const csp = String(res.headers['content-security-policy'] ?? '');
        expect(csp).not.toContain("default-src 'none'");
        expect(scriptSrc(csp)).toMatch(/'self'/);
        const nonce = /'nonce-([^']+)'/.exec(scriptSrc(csp))?.[1];
        expect(nonce, `no nonce in script-src: ${csp}`).toBeDefined();
        // The page's own inline boot script carries that nonce, so the policy lets it run.
        expect(res.text).toContain(`nonce="${nonce}"`);
        expect(csp).toContain("frame-ancestors 'none'");
      });

      it('each UI page gets a fresh nonce', async () => {
        const nonceOf = async () => {
          const res = await browse('/login');
          return /'nonce-([^']+)'/.exec(String(res.headers['content-security-policy']))?.[1];
        };

        const [a, b] = [await nonceOf(), await nonceOf()];

        expect(a).toBeDefined();
        expect(a).not.toBe(b);
      });

      it('signed-in pages carry the nonce-based CSP too', async () => {
        const { key } = await createTestKey(KEY_NAME);

        const res = await browse('/', key);

        expect(res.status).toBe(200);
        const csp = String(res.headers['content-security-policy'] ?? '');
        expect(scriptSrc(csp)).toMatch(/'nonce-[^']+'/);
        expect(csp).not.toContain("default-src 'none'");
      });

      it("JSON /api keeps the strict default-src 'none' CSP", async () => {
        const res = await http().get('/api');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      });
    });

    describe('unknown short codes', () => {
      const UNKNOWN_CODE = 'zzzzzzz';

      it("a browser gets the UI's HTML 404 page", async () => {
        const res = await browse(`/${UNKNOWN_CODE}`);

        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        // Rendered by SvelteKit (its CSP), not Express's JSON 404.
        expect(scriptSrc(String(res.headers['content-security-policy'] ?? ''))).toMatch(/'nonce-/);
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
