import { type RequestHandler, Router } from 'express';
import { AppError } from '../lib/errors.ts';
import { redirectRateLimit } from '../middleware/rate-limit.ts';
import { jsonCsp } from '../middleware/security.ts';
import { RESERVED_CODES } from '../schemas/links.ts';
import { findTarget, recordClick } from '../services/clicks.service.ts';

/** Anything that can't be a code (e.g. `bad~code`) is rejected without a DB round trip. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const RESERVED = new Set(RESERVED_CODES.map((code) => code.toLowerCase()));

type CodeRequestHandler = RequestHandler<{ code: string }>;

/**
 * Paths that are never short codes skip this router entirely (no DB query, no rate-limit hit):
 * - reserved words, case-insensitively — web UI pages such as `/login`;
 * - file-like names (`/robots.txt`, `/favicon.ico`): codes never contain a dot, and these must
 *   reach the web UI's static files whatever the `Accept` header (crawlers accept anything).
 * Without the web UI they end in the app's JSON 404.
 */
const skipNonCodes: CodeRequestHandler = (req, _res, next) => {
  const { code } = req.params;
  if (RESERVED.has(code.toLowerCase()) || code.includes('.')) {
    next('router');
    return;
  }
  next();
};

const followLink: CodeRequestHandler = async (req, res, next) => {
  const { code } = req.params;

  // Express routes HEAD to GET handlers; link checkers and previews shouldn't count as clicks.
  let target: string | null = null;
  if (CODE_PATTERN.test(code)) {
    target =
      req.method === 'HEAD'
        ? await findTarget(code)
        : await recordClick(code, {
            referrer: req.get('referer'),
            userAgent: req.get('user-agent'),
          });
  }

  if (target) {
    res.set('Cache-Control', 'no-store');
    res.redirect(302, target);
    return;
  }

  // Unknown code. API clients (JSON preferred: `application/json`, `*/*` or no Accept, as with
  // curl) get the JSON 404; browsers (`text/html` preferred) leave for the web UI's 404 page.
  if (req.accepts(['json', 'html']) === 'json') next();
  else next('router');
};

const linkNotFound: RequestHandler = () => {
  throw new AppError('NOT_FOUND', 'Link not found');
};

/**
 * Without this, Express would answer `OPTIONS /<any segment>` itself (`200 Allow: GET, HEAD`)
 * instead of letting it reach the web UI, as `OPTIONS /` does. It must sit on the same route as
 * `GET`: a route that doesn't handle OPTIONS still adds its methods to the automatic response.
 */
const passOptionsThrough: RequestHandler = (_req, _res, next) => {
  next('router');
};

/** Mounted after the API and docs: `GET /:code` matches any single path segment. */
export const redirectRouter = Router();

redirectRouter
  .route('/:code')
  .options(passOptionsThrough)
  .get(skipNonCodes, redirectRateLimit, followLink, jsonCsp, linkNotFound);
