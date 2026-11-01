import { z } from 'zod';

/** The API key that authenticated the request (`GET /api/me`). */
export const MeResponse = z
  .object({
    name: z.string().meta({ example: 'my-laptop' }),
    prefix: z.string().meta({ description: 'Display prefix of the key', example: 'tny_AbCd1234' }),
  })
  .meta({ id: 'Me' });
export type MeResponse = z.infer<typeof MeResponse>;
