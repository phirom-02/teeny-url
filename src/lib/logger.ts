// STUB (Phase 1): replaced during Phase 2. Owner: platform agent.
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from '../env.ts';

export const logger = pino({ level: env.LOG_LEVEL });

export const httpLogger = pinoHttp({ logger });
