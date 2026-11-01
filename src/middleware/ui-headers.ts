import type { RequestHandler } from 'express';

/**
 * adapter-node derives a request's origin and client address from headers (`server.ts` points
 * its `PROTOCOL_HEADER` / `ADDRESS_HEADER` here). Overwrite them with what Express resolved —
 * which honours `trust proxy`, so a direct client can't spoof either — before the web UI runs:
 * - the protocol feeds SvelteKit's same-origin (CSRF) check on form actions; without it
 *   adapter-node assumes `https` and rejects every form post over plain http;
 * - the address is what the UI forwards to the API as `X-Forwarded-For` for rate limiting.
 */
export const setResolvedClientHeaders: RequestHandler = (req, _res, next) => {
  // Exactly http or https: a trusted hop's raw X-Forwarded-Proto is never passed on verbatim.
  req.headers['x-forwarded-proto'] = req.secure ? 'https' : 'http';
  req.headers['x-forwarded-for'] = req.ip ?? ''; // `ip` is only missing once the socket is gone
  next();
};
