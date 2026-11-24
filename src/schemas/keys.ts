import { z } from 'zod';

/** Request body for creating a browser session cookie (`POST /api/session`). */
export const CreateSessionBody = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, 'Paste your API key to sign in.')
      .max(256, 'API key is too long')
      .meta({ description: 'Full API key (tny_…)', example: 'tny_AbCd1234…' }),
  })
  .meta({ id: 'CreateSessionRequest' });
export type CreateSessionBody = z.infer<typeof CreateSessionBody>;

/** The API key that authenticated the request (`GET /api/me`, `POST /api/session`). */
export const MeResponse = z
  .object({
    name: z.string().meta({ example: 'my-laptop' }),
    prefix: z.string().meta({ description: 'Display prefix of the key', example: 'tny_AbCd1234' }),
  })
  .meta({ id: 'Me' });
export type MeResponse = z.infer<typeof MeResponse>;
