import { randomBytes } from 'node:crypto';
import { apiReference } from '@scalar/express-api-reference';
import { type Request, type RequestHandler, type Response, Router } from 'express';
import helmet from 'helmet';
import { env } from '../env.ts';
import { jsonCsp } from '../middleware/security.ts';
import { buildOpenApiDocument } from '../openapi.ts';

const OPENAPI_PATH = '/openapi.json';

/** Where Scalar's API client sends "Try it" requests (the document's `servers[0]`). */
const apiOrigin = new URL(env.BASE_URL).origin;

/**
 * `/docs` loads Scalar's single-file bundle from jsDelivr. There is no app-wide CSP (the web UI
 * sends its own), so this route sets a policy that allows exactly what Scalar needs:
 * - scripts: only the two `<script>` tags Scalar renders, authorized by a per-request nonce
 *   (passing a nonce also makes Scalar pick its UMD bundle, which loads no follow-up chunks);
 * - styles: inline `<style>`/`style=""` (Scalar injects its stylesheet and uses style attributes);
 * - fonts: Inter / JetBrains Mono from fonts.scalar.com; images: `data:` URIs for icons;
 * - connect: this origin (the OpenAPI document) and the API origin for "Try it" requests.
 * `upgrade-insecure-requests` is only sent when the service is public over https, so plain-http
 * local development keeps working.
 */
const docsCsp = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    connectSrc: ["'self'", apiOrigin],
    fontSrc: ["'self'", 'https://fonts.scalar.com'],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    scriptSrc: [(_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    ...(apiOrigin.startsWith('https:') && { upgradeInsecureRequests: [] }),
  },
});

const setCspNonce: RequestHandler = (_req, res, next) => {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
};

/** Scalar bakes its config (nonce included) into the handler it returns, so build one per request. */
const renderDocs: RequestHandler = (req, res, next) => {
  res.set('Cache-Control', 'no-store'); // the page embeds a single-use nonce
  const scalar = apiReference({
    url: OPENAPI_PATH,
    pageTitle: 'Teeny-URL API',
    theme: 'purple',
    nonce: res.locals.cspNonce,
    defaultOpenAllTags: true,
    // Turn off the hosted Scalar extras (AI chat, SDK/MCP generator, platform toolbar, telemetry):
    // they call scalar.com services, which this page's CSP deliberately does not allow.
    agent: { disabled: true },
    mcp: { disabled: true },
    showDeveloperTools: 'never',
    telemetry: false,
  });
  scalar(req as Request<never>, res, next);
};

export const docsRouter = Router();

docsRouter.get(OPENAPI_PATH, jsonCsp, (_req, res) => {
  res.json(buildOpenApiDocument());
});

docsRouter.get('/docs', setCspNonce, docsCsp, renderDocs);
