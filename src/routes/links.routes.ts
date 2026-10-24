import { Router } from 'express';
import { currentKey, requireApiKey } from '../middleware/auth.ts';
import { CodeParams, CreateLinkBody, type LinkList, ListLinksQuery } from '../schemas/links.ts';
import { getLinkStats } from '../services/clicks.service.ts';
import {
  createLink,
  deleteLink,
  getOwnedLink,
  listLinks,
  toLink,
} from '../services/links.service.ts';

/** Mounted at `/api`. Auth is scoped to `/links*` so unknown `/api/*` paths still 404. */
export const linksRouter = Router();

linksRouter.use('/links', requireApiKey);

linksRouter.post('/links', async (req, res) => {
  const body = CreateLinkBody.parse(req.body);
  const row = await createLink(currentKey(req).id, body);
  res.status(201).location(`/api/links/${row.code}`).json(toLink(row));
});

linksRouter.get('/links', async (req, res) => {
  const query = ListLinksQuery.parse(req.query);
  const { rows, total } = await listLinks(currentKey(req).id, query);
  const body: LinkList = {
    data: rows.map(toLink),
    pagination: { limit: query.limit, offset: query.offset, total },
  };
  res.json(body);
});

linksRouter.get('/links/:code', async (req, res) => {
  const { code } = CodeParams.parse(req.params);
  const row = await getOwnedLink(currentKey(req).id, code);
  res.json(toLink(row));
});

linksRouter.delete('/links/:code', async (req, res) => {
  const { code } = CodeParams.parse(req.params);
  await deleteLink(currentKey(req).id, code);
  res.status(204).end();
});

linksRouter.get('/links/:code/stats', async (req, res) => {
  const { code } = CodeParams.parse(req.params);
  const row = await getOwnedLink(currentKey(req).id, code);
  res.json(await getLinkStats(row));
});
