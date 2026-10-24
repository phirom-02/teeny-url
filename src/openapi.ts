import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
} from '@asteasolutions/zod-to-openapi';
import type { ZodType } from 'zod';
import pkg from '../package.json' with { type: 'json' };
import { env } from './env.ts';
import type { ErrorCode } from './lib/errors.ts';
import type { ValidationIssue } from './middleware/error-handler.ts';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './middleware/rate-limit.ts';
import { ErrorResponse, HealthResponse, RootResponse } from './schemas/common.ts';
import { CodeParams, CreateLinkBody, Link, LinkList, ListLinksQuery } from './schemas/links.ts';
import { LinkStats } from './schemas/stats.ts';

export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

const BEARER_AUTH = 'bearerAuth';

const DESCRIPTION = `
A tiny URL shortener: create short links, follow them, and see who clicks.

## Authentication
Every \`/api/*\` endpoint requires an API key. Create one on the server with:

\`\`\`sh
pnpm key:create <name>
\`\`\`

The key (\`tny_…\`) is printed once and only its hash is stored. Send it on every request:

\`\`\`http
Authorization: Bearer <key>
\`\`\`

Links are private to the key that created them; other keys' links respond \`404\`.
Redirects (\`GET /{code}\`) and the system endpoints are public.

## Errors
Every error uses the same envelope:

\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "url", "message": "Must be a valid http or https URL" }]
  }
}
\`\`\`

\`code\` is stable and machine-readable; \`message\` is for humans. \`details\` is optional —
for \`VALIDATION_ERROR\` it lists each invalid field as \`{ path, message }\`.

## Rate limiting
\`/api/*\` allows ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000} seconds per client IP.
Every response carries \`RateLimit\` and \`RateLimit-Policy\` headers; going over the limit
returns \`429 RATE_LIMITED\` with a \`Retry-After\` header.
`.trim();

/** A JSON response whose body is `schema` (optionally with a media-type level example). */
function json(description: string, schema: ZodType, example?: unknown): ResponseConfig {
  return {
    description,
    content: { 'application/json': { schema, ...(example !== undefined && { example }) } },
  };
}

/** An error response in the standard envelope, with an example of the given code. */
function error(
  description: string,
  code: ErrorCode,
  message: string,
  details?: ValidationIssue[],
): ResponseConfig {
  return json(description, ErrorResponse, { error: { code, message, details } });
}

const responses = {
  validation: error('The request failed validation', 'VALIDATION_ERROR', 'Invalid request', [
    { path: 'url', message: 'Must be a valid http or https URL' },
  ]),
  unauthorized: error(
    'Missing, malformed, unknown or revoked API key',
    'UNAUTHORIZED',
    'Invalid API key',
  ),
  linkNotFound: error(
    'No link with this code exists for your API key',
    'NOT_FOUND',
    'Link not found',
  ),
  rateLimited: {
    ...error('Rate limit exceeded', 'RATE_LIMITED', 'Too many requests — please slow down'),
    headers: {
      'Retry-After': {
        description: 'Seconds until the current window resets',
        schema: { type: 'integer' },
      },
    },
  },
} satisfies Record<string, ResponseConfig>;

const authenticated = { security: [{ [BEARER_AUTH]: [] }] };

function buildRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', BEARER_AUTH, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'tny_…',
    description: 'API key created with `pnpm key:create <name>`.',
  });

  // ── System ────────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/',
    tags: ['System'],
    operationId: 'getServiceInfo',
    summary: 'Service info',
    description: 'Returns the service name, version and the path of these docs.',
    responses: {
      200: json('Service info', RootResponse),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['System'],
    operationId: 'getHealth',
    summary: 'Health check',
    description: 'Reports process uptime and database reachability; never cached.',
    responses: {
      200: json('The service and its database are healthy', HealthResponse),
      503: json('The database is unreachable', HealthResponse, {
        status: 'degraded',
        db: 'down',
        uptime: 42.5,
      }),
    },
  });

  // ── Links ─────────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/api/links',
    tags: ['Links'],
    ...authenticated,
    operationId: 'createLink',
    summary: 'Create a short link',
    description: 'Shortens an http(s) URL, using your alias if given or a random 7-character code.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: CreateLinkBody } },
      },
    },
    responses: {
      201: json('The created link', Link),
      400: responses.validation,
      401: responses.unauthorized,
      409: error('The alias is already in use', 'ALIAS_TAKEN', 'Alias is already taken'),
      413: error('The request body exceeds 16 kB', 'PAYLOAD_TOO_LARGE', 'Request body too large'),
      429: responses.rateLimited,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/links',
    tags: ['Links'],
    ...authenticated,
    operationId: 'listLinks',
    summary: 'List your links',
    description: 'Lists the links created with your API key, newest first, with offset pagination.',
    request: { query: ListLinksQuery },
    responses: {
      200: json('A page of links', LinkList),
      400: responses.validation,
      401: responses.unauthorized,
      429: responses.rateLimited,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/links/{code}',
    tags: ['Links'],
    ...authenticated,
    operationId: 'getLink',
    summary: 'Get a link',
    description: 'Returns one of your links by its code or alias.',
    request: { params: CodeParams },
    responses: {
      200: json('The link', Link),
      400: responses.validation,
      401: responses.unauthorized,
      404: responses.linkNotFound,
      429: responses.rateLimited,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/links/{code}',
    tags: ['Links'],
    ...authenticated,
    operationId: 'deleteLink',
    summary: 'Delete a link',
    description: 'Deletes one of your links and its click history; the short URL stops working.',
    request: { params: CodeParams },
    responses: {
      204: { description: 'The link was deleted' },
      400: responses.validation,
      401: responses.unauthorized,
      404: responses.linkNotFound,
      429: responses.rateLimited,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/links/{code}/stats',
    tags: ['Links'],
    ...authenticated,
    operationId: 'getLinkStats',
    summary: 'Get click stats',
    description: 'Returns total clicks, daily clicks for the last 30 days and the top referrers.',
    request: { params: CodeParams },
    responses: {
      200: json('Click statistics', LinkStats),
      400: responses.validation,
      401: responses.unauthorized,
      404: responses.linkNotFound,
      429: responses.rateLimited,
    },
  });

  // ── Redirect ──────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/{code}',
    tags: ['Redirect'],
    operationId: 'followLink',
    summary: 'Follow a short link',
    description:
      'Redirects (302) to the target URL with `Cache-Control: no-store`; every GET is counted as a click.',
    request: { params: CodeParams },
    responses: {
      302: {
        description: 'Redirect to the target URL',
        headers: {
          Location: {
            description: 'The target URL',
            schema: { type: 'string', format: 'uri' },
          },
          'Cache-Control': {
            description: 'Always `no-store`, so every visit reaches the server and is counted',
            schema: { type: 'string', example: 'no-store' },
          },
        },
      },
      404: error('No link with this code exists', 'NOT_FOUND', 'Link not found'),
    },
  });

  return registry;
}

let cached: OpenApiDocument | undefined;

/** The OpenAPI 3.1 document for the whole API (built once, then memoized). */
export function buildOpenApiDocument(): OpenApiDocument {
  cached ??= new OpenApiGeneratorV31(buildRegistry().definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Teeny-URL', version: pkg.version, description: DESCRIPTION },
    servers: [{ url: env.BASE_URL }],
    tags: [
      { name: 'Links', description: 'Create and manage your short links (API key required)' },
      { name: 'Redirect', description: 'Public short-link redirects' },
      { name: 'System', description: 'Service info and health' },
    ],
  });
  return cached;
}
