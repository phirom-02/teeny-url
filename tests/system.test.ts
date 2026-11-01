import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { HealthResponse, RootResponse } from '../src/schemas/common.ts';
import { api, expectError } from './helpers.ts';

const SERVICE_INFO = { name: 'Teeny-URL', version: pkg.version, docs: '/docs' };

describe('GET /api', () => {
  it('returns the service name, version and docs link', async () => {
    const res = await api().get('/api');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual(SERVICE_INFO);
    expect(() => RootResponse.parse(res.body)).not.toThrow();
  });

  it('does not require authentication', async () => {
    const res = await api().get('/api').set('Authorization', 'Bearer tny_garbage');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(SERVICE_INFO);
  });

  it('sets security headers, including a strict CSP', async () => {
    const res = await api().get('/api');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('exposes the documented response headers to browser clients', async () => {
    const res = await api().get('/api').set('Origin', 'https://app.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    const exposed = String(res.headers['access-control-expose-headers']).split(',');
    expect(exposed).toEqual(
      expect.arrayContaining(['Location', 'X-Request-Id', 'RateLimit', 'Retry-After']),
    );
  });

  it('answers CORS preflight requests for /api routes', async () => {
    const res = await api()
      .options('/api/links')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(String(res.headers['access-control-allow-methods'])).toMatch(/POST/);
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'authorization',
    );
  });
});

describe('GET / without a UI mounted', () => {
  it('falls back to the service info JSON', async () => {
    const res = await api().get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual(SERVICE_INFO);
  });
});

describe('X-Request-Id', () => {
  it('generates a request id when none is sent', async () => {
    const res = await api().get('/api');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed incoming request id', async () => {
    const res = await api().get('/api').set('X-Request-Id', 'trace-abc.123');

    expect(res.headers['x-request-id']).toBe('trace-abc.123');
  });

  it('replaces a malformed incoming request id', async () => {
    const res = await api().get('/api').set('X-Request-Id', 'bad id with spaces');

    expect(res.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('is set on error responses too', async () => {
    const res = await api().get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('GET /health', () => {
  it('reports ok with the database up', async () => {
    const res = await api().get('/health');

    expect(res.status).toBe(200);
    const body = HealthResponse.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('does not require authentication', async () => {
    const res = await api().get('/health').set('Authorization', 'Bearer tny_garbage');

    expect(res.status).toBe(200);
  });

  it('sends a strict CSP', async () => {
    const res = await api().get('/health');

    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });
});

describe('GET /openapi.json', () => {
  it('serves an OpenAPI 3.1 document', async () => {
    const res = await api().get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(typeof res.body.openapi).toBe('string');
    expect(res.body.openapi.startsWith('3.1')).toBe(true);
    expect(res.body.info).toEqual(expect.objectContaining({ title: expect.any(String) }));
  });

  it('documents every public path and method', async () => {
    const { body } = await api().get('/openapi.json');
    const paths = body.paths ?? {};

    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/api',
        '/api/me',
        '/api/links',
        '/api/links/{code}',
        '/api/links/{code}/stats',
        '/{code}',
        '/health',
      ]),
    );
    expect(paths['/api']).toHaveProperty('get');
    expect(paths['/api/me']).toHaveProperty('get');
    expect(paths['/api/links']).toHaveProperty('post');
    expect(paths['/api/links']).toHaveProperty('get');
    expect(paths['/api/links/{code}']).toHaveProperty('get');
    expect(paths['/api/links/{code}']).toHaveProperty('delete');
    expect(paths['/api/links/{code}/stats']).toHaveProperty('get');
    expect(paths['/{code}']).toHaveProperty('get');
    expect(paths['/health']).toHaveProperty('get');
  });

  it('no longer documents GET / (service info moved to GET /api)', async () => {
    const { body } = await api().get('/openapi.json');

    expect(Object.keys(body.paths ?? {})).not.toContain('/');
  });

  it('documents GET /api as public and GET /api/me as bearer-authenticated', async () => {
    const { body } = await api().get('/openapi.json');

    expect(body.paths['/api'].get.security ?? []).toEqual([]);
    expect(body.paths['/api/me'].get.security).toEqual([{ bearerAuth: [] }]);
  });

  it('defines the Link, LinkStats, Me and Error schemas and a bearer security scheme', async () => {
    const { body } = await api().get('/openapi.json');

    expect(Object.keys(body.components?.schemas ?? {})).toEqual(
      expect.arrayContaining(['Link', 'LinkStats', 'Me', 'Error']),
    );
    const bearer = body.components?.securitySchemes?.bearerAuth;
    expect(bearer).toBeDefined();
    expect(bearer.type).toBe('http');
    expect(String(bearer.scheme).toLowerCase()).toBe('bearer');
  });
});

describe('GET /docs', () => {
  it('serves the HTML API reference', async () => {
    const res = await api().get('/docs');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text.length).toBeGreaterThan(0);
  });
});

describe('unknown routes without a UI mounted', () => {
  it('returns 404 NOT_FOUND for an unknown /api route', async () => {
    const res = await api().get('/api/nope');

    expectError(res, 404, 'NOT_FOUND');
  });

  it('returns 404 NOT_FOUND for POST to an unknown path', async () => {
    const res = await api().post('/something').send({ a: 1 });

    expectError(res, 404, 'NOT_FOUND');
  });

  it('returns 404 NOT_FOUND for a multi-segment unknown path', async () => {
    const res = await api().get('/a/b/c');

    expectError(res, 404, 'NOT_FOUND');
  });
});
