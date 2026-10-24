import { z } from 'zod';
import { ERROR_STATUS, type ErrorCode } from '../lib/errors.ts';

export const ErrorCodeSchema = z.enum(Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]]);

export const ErrorResponse = z
  .object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({
    id: 'Error',
    example: { error: { code: 'NOT_FOUND', message: 'Link not found' } },
  });
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const HealthResponse = z
  .object({
    status: z.enum(['ok', 'degraded']),
    db: z.enum(['up', 'down']),
    uptime: z.number().meta({ description: 'Process uptime in seconds' }),
  })
  .meta({ id: 'Health' });
export type HealthResponse = z.infer<typeof HealthResponse>;

export const RootResponse = z
  .object({ name: z.string(), version: z.string(), docs: z.string() })
  .meta({ id: 'Root' });
export type RootResponse = z.infer<typeof RootResponse>;
