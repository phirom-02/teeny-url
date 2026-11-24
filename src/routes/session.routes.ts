import { Router } from 'express';
import { assertSameOrigin, clearSessionCookie, setSessionCookie } from '../lib/cookies.ts';
import { AppError } from '../lib/errors.ts';
import { CreateSessionBody, type MeResponse } from '../schemas/keys.ts';
import { authenticate } from '../services/api-keys.service.ts';

/** Mounted at `/api`: browser UI session cookie lifecycle (`POST`/`DELETE /api/session`). */
export const sessionRouter = Router();

sessionRouter.post('/session', async (req, res) => {
  assertSameOrigin(req);

  const { key } = CreateSessionBody.parse(req.body);
  const authenticated = await authenticate(key);
  if (!authenticated) {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    throw new AppError('UNAUTHORIZED', 'That API key wasn’t recognized or has been revoked.');
  }

  setSessionCookie(req, res, key);
  res.set('Cache-Control', 'private, no-store');
  const body: MeResponse = { name: authenticated.name, prefix: authenticated.prefix };
  res.status(200).json(body);
});

sessionRouter.delete('/session', (req, res) => {
  assertSameOrigin(req);
  clearSessionCookie(req, res);
  res.set('Cache-Control', 'private, no-store');
  res.status(204).end();
});
