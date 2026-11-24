/**
 * Type-only re-exports of the API's Zod contracts. Kept type-only so the web bundle never imports
 * server runtime code.
 */
export type { ValidationIssue } from '../../../src/middleware/error-handler.ts';
export type { ErrorResponse } from '../../../src/schemas/common.ts';
export type { CreateSessionBody, MeResponse as Me } from '../../../src/schemas/keys.ts';
export type { CreateLinkBody, Link, LinkList } from '../../../src/schemas/links.ts';
export type { LinkStats } from '../../../src/schemas/stats.ts';
