import { type RequestHandler, Router } from 'express';
import pkg from '../../package.json' with { type: 'json' };
import { currentKey, requireApiKey } from '../middleware/auth.ts';
import type { RootResponse } from '../schemas/common.ts';
import type { MeResponse } from '../schemas/keys.ts';

/** `GET /api` — and `GET /` when the web UI isn't mounted. Public. */
export const serviceInfo: RequestHandler = (_req, res) => {
  const body: RootResponse = { name: 'Teeny-URL', version: pkg.version, docs: '/docs' };
  res.json(body);
};

/** Mounted at `/api`: service info and the caller's own key. */
export const metaRouter = Router();

metaRouter.get('/', serviceInfo);

metaRouter.get('/me', requireApiKey, (req, res) => {
  const { name, prefix } = currentKey(req);
  const body: MeResponse = { name, prefix };
  res.json(body);
});
