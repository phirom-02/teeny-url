import { Router } from 'express';
import { AppError } from '../lib/errors.ts';
import { findTarget, recordClick } from '../services/clicks.service.ts';

/** Anything that can't be a code (e.g. `favicon.ico`) is rejected without a DB round trip. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Mounted last at `/`: `GET /:code` matches any single path segment. */
export const redirectRouter = Router();

redirectRouter.get('/:code', async (req, res) => {
  const { code } = req.params;
  if (!CODE_PATTERN.test(code)) throw new AppError('NOT_FOUND', 'Link not found');

  // Express routes HEAD to GET handlers; link checkers and previews shouldn't count as clicks.
  const target =
    req.method === 'HEAD'
      ? await findTarget(code)
      : await recordClick(code, {
          referrer: req.get('referer'),
          userAgent: req.get('user-agent'),
        });
  if (!target) throw new AppError('NOT_FOUND', 'Link not found');

  res.set('Cache-Control', 'no-store');
  res.redirect(302, target);
});
