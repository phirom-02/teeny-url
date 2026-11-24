import { z } from 'zod';

const MAX_URL_LENGTH = 2048;

/** Mirrors `RESERVED_CODES` in `src/schemas/links.ts` (compared case-insensitively). */
const RESERVED_CODES = new Set([
  'api',
  'docs',
  'health',
  'openapi',
  'admin',
  'static',
  'login',
  'logout',
  'links',
  'settings',
  'account',
  '_app',
]);

export const loginFormSchema = z.object({
  key: z.string().trim().min(1, 'Paste your API key to sign in.').max(256, 'API key is too long.'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const shortenFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Enter the URL you want to shorten.')
    .pipe(
      z
        .url({ protocol: /^https?$/, error: 'Must be a valid http or https URL' })
        .max(MAX_URL_LENGTH, `URL must be at most ${MAX_URL_LENGTH} characters`),
    ),
  alias: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^[A-Za-z0-9_-]{3,32}$/.test(value),
      'Alias must be 3–32 characters: letters, digits, "-" or "_"',
    )
    .refine(
      (value) => value === '' || !RESERVED_CODES.has(value.toLowerCase()),
      'This alias is reserved',
    ),
});

export type ShortenFormValues = z.infer<typeof shortenFormSchema>;
