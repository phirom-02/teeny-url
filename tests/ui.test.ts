import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { db } from '../src/db/client.ts';
import { links } from '../src/db/schema.ts';
import { HealthResponse, RootResponse } from '../src/schemas/common.ts';
import { Link } from '../src/schemas/links.ts';
import {
  api,
  apiWithUi,
  BROWSER_ACCEPT,
  CHROME_ACCEPT,
  clickRowsFor,
  createLink,
  createTestKey,
  expectError,
  expectUi,
  expectUiForwarded,
  UI_STUB_MARKER,
} from './helpers.ts';

/**
 * Routing when a web UI is mounted with `createApp({ uiHandler })`. The handler is a stub standing
 * in for SvelteKit (see `uiStub` in helpers.ts): it echoes method, URL and the raw body it read.
 */

const TARGET = 'https://example.com/landing?from=teeny';
const UNKNOWN_CODE = 'zzzzzzz';

/** `GET path` on the UI-mounted app, with an `Accept` header only when one is given. */
function uiGet(path: string, accept?: string) {
  const req = apiWithUi().get(path);
  return accept === undefined ? req : req.set('Accept', accept);
}

/** `Accept` variants a non-browser client (curl, fetch, API SDKs) sends. */
const NON_BROWSER_ACCEPTS = [
  ['no Accept header', undefined],
  ['Accept: */*', '*/*'],
  ['Accept: application/json', 'application/json'],
] as const;

describe('with a UI mounted: pages and assets', () => {
  const cases = ['/', '/login', '/_app/immutable/x.js', '/some/deep/path'].flatMap((path) =>
    [
      ['no Accept header', undefined],
      ['Accept: */*', '*/*'],
      ['a browser Accept header', BROWSER_ACCEPT],
    ].map(([label, accept]) => [path, label, accept] as const),
  );

  it.each(cases)('GET %s with %s → UI', async (path, _label, accept) => {
    const echo = expectUi(await uiGet(path, accept));

    expect(echo).toEqual({ method: 'GET', url: path, body: '', bodyConsumed: false });
  });

  it('passes the query string through to the UI', async () => {
    const echo = expectUi(await uiGet('/login?redirectTo=%2Flinks', BROWSER_ACCEPT));

    expect(echo.url).toBe('/login?redirectTo=%2Flinks');
  });
});

describe('with a UI mounted: request bodies reach the UI unread', () => {
  it('POST /login (urlencoded form) → UI with the raw body', async () => {
    const res = await apiWithUi()
      .post('/login')
      .set('Accept', BROWSER_ACCEPT)
      .type('form')
      .send('key=abc');

    expect(expectUi(res)).toEqual({
      method: 'POST',
      url: '/login',
      body: 'key=abc',
      bodyConsumed: false,
    });
  });

  it('POST /login from an enhanced SvelteKit form (Accept: application/json) → UI', async () => {
    const res = await apiWithUi()
      .post('/login')
      .set('Accept', 'application/json')
      .set('x-sveltekit-action', 'true')
      .type('form')
      .send('key=abc');

    expect(expectUi(res)).toEqual({
      method: 'POST',
      url: '/login',
      body: 'key=abc',
      bodyConsumed: false,
    });
  });

  it('POST /?/shorten (named form action) → UI with the raw body', async () => {
    const body = 'url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1&alias=my-link';

    const res = await apiWithUi()
      .post('/?/shorten')
      .set('Accept', 'application/json')
      .set('x-sveltekit-action', 'true')
      .type('form')
      .send(body);

    expect(expectUi(res)).toEqual({ method: 'POST', url: '/?/shorten', body, bodyConsumed: false });
  });

  it('a multipart form body reaches the UI unread', async () => {
    const res = await apiWithUi().post('/login').field('key', 'abc');

    const echo = expectUi(res);
    expect(echo.bodyConsumed).toBe(false);
    expect(echo.body).toContain('name="key"');
    expect(echo.body).toContain('abc');
  });

  it('a JSON body outside /api is not parsed by Express', async () => {
    const res = await apiWithUi().post('/login').send({ key: 'abc' });

    expect(expectUi(res)).toEqual({
      method: 'POST',
      url: '/login',
      body: '{"key":"abc"}',
      bodyConsumed: false,
    });
  });

  it('a body over the API 16kb limit still reaches the UI (no 413 outside /api)', async () => {
    const body = `key=${'x'.repeat(20 * 1024)}`;

    const res = await apiWithUi().post('/login').type('form').send(body);

    const echo = expectUi(res);
    expect(echo.bodyConsumed).toBe(false);
    expect(echo.body).toBe(body);
  });
});

describe('with a UI mounted: reserved paths belong to the UI', () => {
  const reserved = ['/login', '/LOGOUT', '/logout', '/Links', '/settings', '/account'];
  const cases = reserved.flatMap((path) =>
    [
      ['no Accept header', undefined],
      ['Accept: */*', '*/*'],
    ].map(([label, accept]) => [path, label, accept] as const),
  );

  it.each(cases)('GET %s with %s → UI', async (path, _label, accept) => {
    const echo = expectUi(await uiGet(path, accept));

    expect(echo).toEqual({ method: 'GET', url: path, body: '', bodyConsumed: false });
  });

  it('serves a reserved path from the UI without looking up a link for it', async () => {
    // A link that predates the reservation (inserted directly, bypassing alias validation).
    const { apiKey } = await createTestKey();
    await db
      .insert(links)
      .values({ code: 'login', targetUrl: TARGET, apiKeyId: apiKey.id, isCustom: true });

    const res = await uiGet('/login');

    expectUi(res);
    expect(await clickRowsFor('login')).toHaveLength(0);
  });
});

describe('without a UI mounted: reserved paths', () => {
  it.each(['/login', '/LOGOUT'])('GET %s → JSON 404 NOT_FOUND', async (path) => {
    const res = await api().get(path);

    expectError(res, 404, 'NOT_FOUND');
  });

  it('GET /login from a browser → JSON 404 NOT_FOUND', async () => {
    const res = await api().get('/login').set('Accept', BROWSER_ACCEPT);

    expectError(res, 404, 'NOT_FOUND');
  });
});

describe('with a UI mounted: unknown short codes', () => {
  it.each([
    ['a browser', BROWSER_ACCEPT],
    ['Chrome', CHROME_ACCEPT],
  ])('%s gets the UI (which renders its own 404 page)', async (_label, accept) => {
    const echo = expectUi(await uiGet(`/${UNKNOWN_CODE}`, accept));

    expect(echo).toEqual({
      method: 'GET',
      url: `/${UNKNOWN_CODE}`,
      body: '',
      bodyConsumed: false,
    });
  });

  it.each(NON_BROWSER_ACCEPTS)('%s gets JSON 404 "Link not found"', async (_label, accept) => {
    const res = await uiGet(`/${UNKNOWN_CODE}`, accept);

    expectError(res, 404, 'NOT_FOUND');
    expect(res.body.error.message).toBe('Link not found');
  });

  it.each(['/bad~code', '/bad.code'])(
    'a browser asking for %s (cannot be a code) gets the UI',
    async (path) => {
      const echo = expectUi(await uiGet(path, BROWSER_ACCEPT));

      expect(echo.url).toBe(path);
    },
  );

  it.each(NON_BROWSER_ACCEPTS)(
    'a path that cannot be a code (/bad~code) with %s → JSON 404',
    async (_label, accept) => {
      expectError(await uiGet('/bad~code', accept), 404, 'NOT_FOUND');
    },
  );

  // File-like paths (/robots.txt, /favicon.ico, SvelteKit's /__data.json) always belong to the UI:
  // crawlers and the SvelteKit client send `Accept: */*`, which would otherwise get JSON.
  it.each(NON_BROWSER_ACCEPTS)(
    'a dotted path (/robots.txt, /bad.code) with %s goes to the UI',
    async (_label, accept) => {
      expect(expectUi(await uiGet('/robots.txt', accept)).url).toBe('/robots.txt');
      expect(expectUi(await uiGet('/bad.code', accept)).url).toBe('/bad.code');
    },
  );
});

describe('with a UI mounted: known short codes always redirect', () => {
  it.each([
    ['no Accept header', undefined],
    ['a browser Accept header', BROWSER_ACCEPT],
    ['Chrome', CHROME_ACCEPT],
  ])('302 to the target and counts the click (%s)', async (_label, accept) => {
    const { auth } = await createTestKey();
    const link = await createLink(auth, { url: TARGET });

    const res = await uiGet(`/${link.code}`, accept);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(TARGET);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.text ?? '').not.toContain(UI_STUB_MARKER);
    expect(await clickRowsFor(link.code)).toHaveLength(1);
  });

  it('redirects custom aliases for browsers', async () => {
    const { auth } = await createTestKey();
    await createLink(auth, { url: TARGET, alias: 'spring-promo' });

    const res = await uiGet('/spring-promo', BROWSER_ACCEPT);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(TARGET);
    expect(await clickRowsFor('spring-promo')).toHaveLength(1);
  });
});

describe('with a UI mounted: /api never reaches the UI', () => {
  it.each([
    ['no Accept header', undefined],
    ['a browser Accept header', BROWSER_ACCEPT],
  ])('GET /api/nope with %s → JSON 404', async (_label, accept) => {
    expectError(await uiGet('/api/nope', accept), 404, 'NOT_FOUND');
  });

  it('POST /api/nope with a JSON body → JSON 404', async () => {
    const res = await apiWithUi().post('/api/nope').send({ a: 1 });

    expectError(res, 404, 'NOT_FOUND');
  });

  it('POST /api/nope with a form body from a browser → JSON 404', async () => {
    const res = await apiWithUi()
      .post('/api/nope')
      .set('Accept', BROWSER_ACCEPT)
      .type('form')
      .send('a=1');

    expectError(res, 404, 'NOT_FOUND');
  });

  it('GET /api → service info JSON', async () => {
    const res = await uiGet('/api', BROWSER_ACCEPT);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(RootResponse.parse(res.body)).toEqual({
      name: 'Teeny-URL',
      version: pkg.version,
      docs: '/docs',
    });
  });

  it('the links API works end to end', async () => {
    const { auth } = await createTestKey();

    const created = await apiWithUi().post('/api/links').set(auth).send({ url: TARGET });
    expect(created.status).toBe(201);
    const link = Link.parse(created.body);

    const fetched = await apiWithUi().get(`/api/links/${link.code}`).set(auth);
    expect(fetched.status).toBe(200);
    expect(Link.parse(fetched.body)).toEqual(link);
  });

  it('rejects malformed JSON with 400 VALIDATION_ERROR', async () => {
    const { auth } = await createTestKey();

    const res = await apiWithUi()
      .post('/api/links')
      .set(auth)
      .set('Content-Type', 'application/json')
      .send('{"url": "https://example.com/",');

    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('rejects a JSON body over 16kb with 413 PAYLOAD_TOO_LARGE', async () => {
    const { auth } = await createTestKey();

    const res = await apiWithUi()
      .post('/api/links')
      .set(auth)
      .send({ url: TARGET, padding: 'x'.repeat(17 * 1024) });

    expectError(res, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('a browser without a key gets JSON 401, not the UI', async () => {
    const res = await uiGet('/api/links', BROWSER_ACCEPT);

    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('answers CORS preflight for /api routes itself', async () => {
    const res = await apiWithUi()
      .options('/api/links')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('with a UI mounted: Express still serves the system routes', () => {
  it('GET /health', async () => {
    const res = await uiGet('/health', BROWSER_ACCEPT);

    expect(res.status).toBe(200);
    expect(HealthResponse.parse(res.body).db).toBe('up');
  });

  it('GET /openapi.json', async () => {
    const res = await uiGet('/openapi.json', BROWSER_ACCEPT);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(String(res.body.openapi)).toMatch(/^3\.1/);
  });

  it('GET /docs serves the API reference with its own nonce-based CSP', async () => {
    const res = await uiGet('/docs', BROWSER_ACCEPT);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).not.toContain(UI_STUB_MARKER);
    expect(res.headers['content-security-policy']).toMatch(/script-src 'nonce-/);
  });
});

describe('with a UI mounted: response headers', () => {
  it('UI responses carry no CSP from Express but keep the other security headers', async () => {
    const res = await uiGet('/login', BROWSER_ACCEPT);

    expectUi(res);
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('UI responses get an X-Request-Id', async () => {
    const res = await uiGet('/', BROWSER_ACCEPT);

    expectUi(res);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('UI responses are not CORS-enabled', async () => {
    const res = await uiGet('/login', BROWSER_ACCEPT).set('Origin', 'https://evil.example.com');

    expectUi(res);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each(['/api', '/health'])('JSON responses from %s carry a strict CSP', async (path) => {
    const res = await uiGet(path);

    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('GET /api is CORS-enabled and exposes the documented headers', async () => {
    const res = await uiGet('/api').set('Origin', 'https://app.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    const exposed = String(res.headers['access-control-expose-headers']).split(',');
    expect(exposed).toEqual(expect.arrayContaining(['Location', 'X-Request-Id', 'RateLimit']));
  });
});

/**
 * adapter-node derives the client address (`ADDRESS_HEADER=x-forwarded-for`) and the request
 * origin's scheme (`PROTOCOL_HEADER=x-forwarded-proto`, which feeds SvelteKit's CSRF check and the
 * cookie `Secure` flag) from headers. `setResolvedClientHeaders` must overwrite both with what
 * Express resolved (`req.ip`, `req.protocol`, honouring `trust proxy`) before the UI runs.
 * supertest connects from loopback, which is a trusted hop.
 */
describe('with a UI mounted: the UI gets the client identity Express resolved', () => {
  /** `127.x.x.x`, its IPv4-mapped IPv6 form, or `::1`. */
  const LOOPBACK = /^(?:(?:::ffff:)?127(?:\.\d{1,3}){3}|::1)$/;

  it('X-Forwarded-For with a chain reaches the UI as the single resolved client IP', async () => {
    const res = await uiGet('/login', BROWSER_ACCEPT).set('X-Forwarded-For', '1.1.1.1, 2.2.2.2');

    // Trust stops at the first untrusted hop from the right: 2.2.2.2. Never the raw chain.
    expect(expectUiForwarded(res)['x-forwarded-for']).toBe('2.2.2.2');
  });

  it('a form POST to the UI gets the resolved client IP and protocol too', async () => {
    const res = await apiWithUi()
      .post('/login')
      .set('Accept', BROWSER_ACCEPT)
      .set('X-Forwarded-For', '1.1.1.1, 2.2.2.2')
      .type('form')
      .send('key=abc');

    expect(expectUiForwarded(res)).toEqual({
      'x-forwarded-for': '2.2.2.2',
      'x-forwarded-proto': 'http',
    });
  });

  it('without X-Forwarded-For the UI gets the socket address (loopback)', async () => {
    const res = await uiGet('/login', BROWSER_ACCEPT);

    const forwardedFor = expectUiForwarded(res)['x-forwarded-for'];
    expect(forwardedFor).toMatch(LOOPBACK);
  });

  it('X-Forwarded-Proto: https from a trusted (loopback) hop → https', async () => {
    const res = await uiGet('/login', BROWSER_ACCEPT).set('X-Forwarded-Proto', 'https');

    expect(expectUiForwarded(res)['x-forwarded-proto']).toBe('https');
  });

  it('without X-Forwarded-Proto the UI gets the socket protocol (http)', async () => {
    const res = await uiGet('/login', BROWSER_ACCEPT);

    expect(expectUiForwarded(res)['x-forwarded-proto']).toBe('http');
  });

  // Express resolves a trusted hop's first comma-separated value; the UI only ever receives
  // exactly `http` or `https` (anything that isn't https counts as http).
  it.each([
    ['https, http', 'https'],
    ['javascript, https', 'http'],
    ['javascript', 'http'],
  ])('X-Forwarded-Proto: %s from loopback → %s', async (sent, resolved) => {
    const res = await uiGet('/login', BROWSER_ACCEPT).set('X-Forwarded-Proto', sent);

    expect(expectUiForwarded(res)['x-forwarded-proto']).toBe(resolved);
  });
});
