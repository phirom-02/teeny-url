import { z } from 'zod';

export const SHORT_CODE_LENGTH = 7;
export const MAX_URL_LENGTH = 2048;

/** Codes that would shadow our own routes. Compared case-insensitively. */
export const RESERVED_CODES: readonly string[] = [
  'api',
  'docs',
  'health',
  'openapi',
  'admin',
  'static',
];

export const Alias = z
  .string()
  .regex(/^[A-Za-z0-9_-]{3,32}$/, 'Alias must be 3–32 characters: letters, digits, "-" or "_"')
  .refine((alias) => !RESERVED_CODES.includes(alias.toLowerCase()), 'This alias is reserved')
  .meta({ description: 'Custom short code (case-sensitive)', example: 'launch-day' });

export const TargetUrl = z
  .url({ protocol: /^https?$/, error: 'Must be a valid http or https URL' })
  .max(MAX_URL_LENGTH, `URL must be at most ${MAX_URL_LENGTH} characters`)
  .meta({
    description: 'Destination URL (http or https)',
    example: 'https://example.com/a/long/path',
  });

export const CreateLinkBody = z
  .object({
    url: TargetUrl,
    alias: Alias.optional(),
  })
  .meta({ id: 'CreateLinkRequest' });
export type CreateLinkBody = z.infer<typeof CreateLinkBody>;

export const CodeParams = z.object({
  code: z.string().min(1).max(64).meta({ description: 'Short code or alias', example: 'aZ3kP9q' }),
});
export type CodeParams = z.infer<typeof CodeParams>;

export const ListLinksQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListLinksQuery = z.infer<typeof ListLinksQuery>;

export const Link = z
  .object({
    code: z.string().meta({ example: 'aZ3kP9q' }),
    shortUrl: z.url().meta({ example: 'http://localhost:3000/aZ3kP9q' }),
    targetUrl: z.string().meta({ example: 'https://example.com/a/long/path' }),
    isCustom: z.boolean(),
    clickCount: z.number().int(),
    lastClickedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Link' });
export type Link = z.infer<typeof Link>;

export const LinkList = z
  .object({
    data: z.array(Link),
    pagination: z.object({
      limit: z.number().int(),
      offset: z.number().int(),
      total: z.number().int(),
    }),
  })
  .meta({ id: 'LinkList' });
export type LinkList = z.infer<typeof LinkList>;
