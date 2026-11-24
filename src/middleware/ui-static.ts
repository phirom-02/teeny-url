import path from 'node:path';
import express, { type RequestHandler, Router } from 'express';
import helmet from 'helmet';

/**
 * Strict CSP for the React SPA: Vite compiles all JS/CSS to external files and Tailwind produces
 * utility stylesheets with zero inline `<script>` or `style="..."` attributes.
 */
const uiCsp = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
});

/** Known client-side routes that should return HTTP 200; everything else returns HTTP 404. */
const KNOWN_UI_ROUTES = new Set(['/', '/login']);

function isKnownUiRoute(pathname: string): boolean {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return KNOWN_UI_ROUTES.has(normalized);
}

/**
 * Serves the static Vite React build (`web/dist`) with strict CSP, long-term caching for hashed
 * `/assets/*` files, and SPA fallback (`index.html` with 200 for known routes and 404 for unknown
 * paths or missing short codes).
 */
export function createUiHandler(distDir: string): RequestHandler {
  const indexHtml = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets') + path.sep;
  const router = Router();

  router.use(uiCsp);
  router.use(
    express.static(distDir, {
      index: false,
      fallthrough: true,
      setHeaders(res, filePath) {
        if (filePath.startsWith(assetsDir)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  router.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).set('Allow', 'GET, HEAD').end();
      return;
    }

    const status = isKnownUiRoute(req.path) ? 200 : 404;
    res.status(status).set('Cache-Control', 'no-store').sendFile(indexHtml);
  });

  return router;
}
