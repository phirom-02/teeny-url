# Teeny-URL

URL shortener API. Express 5 + TypeScript on Node 24 (native type stripping — no build step), PostgreSQL 17 (Docker) via Drizzle ORM, zod contracts, OpenAPI docs at `/docs`.

## Commands
| Task | Command |
|---|---|
| Start Postgres | `pnpm docker:up` (container `teeny-url-postgres`, port 5432; also creates `teeny_url_test`) |
| Apply migrations | `pnpm db:migrate` |
| Create an API key | `pnpm key:create <name>` (also `key:list`, `key:revoke <id-or-prefix>`) |
| Dev server (watch) | `pnpm dev` → http://localhost:3000, docs at `/docs` |
| Tests | `pnpm test` (real Postgres test DB, no mocks) |
| Typecheck / lint / format | `pnpm typecheck` · `pnpm lint` · `pnpm format` |
| New migration | edit `src/db/schema.ts` → `pnpm db:generate --name <desc>` → `pnpm db:migrate` |

## Layout
- `src/app.ts` — `createApp()`: middleware → routers → `notFound` → `errorHandler`. `redirectRouter` (`GET /:code`) is mounted last.
- `src/schemas/` — zod request/response contracts (single source of truth for validation, types and OpenAPI).
- `src/routes/` → `src/services/` → `src/db/`. Routes parse input and shape output; services hold logic and queries.
- `src/lib/` — errors, logger, short-code, URL and API-key helpers. `scripts/keys.ts` — key management CLI.
- `tests/` — vitest + supertest against `createApp()`.

## Conventions
- **Contracts first:** add/modify the zod schema in `src/schemas`, then the route, then register it in `src/openapi.ts`.
- **Errors:** throw `AppError(code, message, details?)` (`src/lib/errors.ts`). Envelope is always `{ error: { code, message, details? } }`. Zod errors → 400 `VALIDATION_ERROR`.
- **Auth:** `Authorization: Bearer tny_…`. Keys are stored as SHA-256 hashes only. `requireApiKey` + `currentKey(req)` from `src/middleware/auth.ts`.
- **Ownership:** every `/api/links*` query filters by the caller's key id; other keys' links are 404.
- **Redirects:** `302` + `Cache-Control: no-store`; click insert + counter increment happen in one transaction.
- **TypeScript:** relative imports end in `.ts`; `import type` for types; no enums/namespaces/parameter properties.
- Never commit `.env`. Never log `Authorization` headers or plaintext keys.

## Sub-agents (`.claude/agents/`)
| Agent | Use for | Owns |
|---|---|---|
| `db-architect` | schema, migrations, indexes, complex SQL | `src/db/**`, `drizzle/**` |
| `api-engineer` | routes, middleware, services, contracts, OpenAPI | `src/**` except `src/db` |
| `test-engineer` | writing/fixing tests, bug repro | `tests/**`, `vitest.config.ts` |
| `code-reviewer` | pre-commit review (read-only) | — |
| `docs-writer` | README, CLAUDE.md, `.env.example` | `*.md`, `.env.example` |

**Delegation pattern for a feature:** `db-architect` (if schema changes) → `api-engineer` and `test-engineer` **in parallel** (they own disjoint files; tests are written against the zod contracts) → main agent integrates until `pnpm typecheck && pnpm lint && pnpm test` pass → `code-reviewer` and `docs-writer` **in parallel** → apply fixes → commit.
Run agents in parallel only when their file ownership doesn't overlap; split one area across several `api-engineer` instances by assigning each an explicit file list.
