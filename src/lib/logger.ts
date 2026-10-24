import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from '../env.ts';

/** An incoming `X-Request-Id` is reused only when it looks like a sane token. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  // Defense in depth: the HTTP serializers below never emit headers in the first place.
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'SYS:HH:MM:ss.l',
        // The message already reads "GET /path 200 3ms"; hide the structured duplicates.
        ignore: 'pid,hostname,req,res,responseTime',
      },
    },
  }),
});

interface SerializedReq {
  id: unknown;
  method: string;
  url: string;
}

interface SerializedRes {
  statusCode: number;
}

export const httpLogger = pinoHttp<Request, Response>({
  logger,
  genReqId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  serializers: {
    req: ({ id, method, url }: SerializedReq) => ({ id, method, url }),
    res: ({ statusCode }: SerializedRes) => ({ statusCode }),
  },
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    // Health probes hit this constantly; keep them out of info-level logs.
    if (req.originalUrl === '/health') return 'debug';
    return 'info';
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime}ms`,
  customErrorMessage: (req, res) => `${req.method} ${req.originalUrl} ${res.statusCode}`,
  // The error handler already logged the real error for 5xx responses, so drop the placeholder
  // "failed with status code 500" error pino-http would otherwise attach to the completion line.
  customErrorObject(_req, res, _err, val) {
    if (res.statusCode >= 500 && res.err === undefined) {
      const { err: _placeholder, ...rest } = val;
      return rest;
    }
    return val;
  },
});
