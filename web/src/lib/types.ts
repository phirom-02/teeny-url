/**
 * API contract types, imported type-only from the Express API's zod schemas in the repo-root
 * `src/schemas/*.ts` — the single source of truth. `import type` is erased at build time, so no
 * API runtime code (and no zod) ends up in the UI bundle.
 */
export type { ErrorResponse } from '../../../src/schemas/common.ts';
export type { MeResponse as Me } from '../../../src/schemas/keys.ts';
export type { CreateLinkBody, Link, LinkList } from '../../../src/schemas/links.ts';

/**
 * One entry of `details` on a `VALIDATION_ERROR`. Mirrors `ValidationIssue` in
 * src/middleware/error-handler.ts (not imported: that module pulls in Express types).
 */
export interface ValidationIssue {
  path: string;
  message: string;
}
