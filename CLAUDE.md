# Teeny-URL

URL shortener: JSON API + server-rendered web UI.
- **API (`src/`):** Express 5 + TypeScript 7 on Node 24 (native type stripping — no build step), PostgreSQL 17 (Docker) via Drizzle ORM, zod contracts, OpenAPI docs at `/docs`.
- **UI (`web/`):** pnpm workspace package `@teeny-url/web` — SvelteKit 3.1 + Svelte 5 + Vite 8 + adapter-node, its own TypeScript 6. In production Express mounts its build, so one server serves UI + API + docs + redirects.

## Commands
| Task | Command |
|---|---|
| Start Postgres | `pnpm docker:up` (container `teeny-url-postgres`, port 5432; also creates `teeny_url_test`) |
| Apply migrations | `pnpm db:migrate` |
| Create an API key | `pnpm key:create <name>` (also `key:list`, `key:revoke <id-or-prefix>`) |
| Dev (API + UI, watch) | `pnpm dev` → UI http://localhost:5173 (Vite, hot reload) + API http://localhost:3000 (`SERVE_UI=false`, docs at `/docs`). One side only: `pnpm dev:api` · `pnpm dev:web` |
| Production run | `pnpm build` (UI → `web/build`) then `pnpm start` → http://localhost:3000. UI not built or `SERVE_UI=false` → API only, `GET /` returns the service-info JSON |
| Tests | `pnpm test` (real Postgres test DB, no mocks; UI routing uses a stub `uiHandler`, no build needed) |
| Typecheck / lint / format | `pnpm typecheck` (tsc + svelte-check) · `pnpm lint` · `pnpm format` (Biome: `.ts`/`.json` incl. `web/`, not `.svelte`) |
| New migration | edit `src/db/schema.ts` → `pnpm db:generate --name <desc>` → `pnpm db:migrate` |

## Layout
- `src/app.ts` — `createApp({ uiHandler? })`: logger/helmet → `/health`, `/docs`, `/openapi.json` → `/api` (CSP, CORS, JSON body, rate limit, `metaRouter`: `GET /api` + `GET /api/me`, `linksRouter`, JSON 404) → `redirectRouter` (`GET /:code`) → UI handler, or (API-only) `GET /` service info + JSON 404 → `errorHandler`.
- `src/server.ts` — loads `web/build/handler.js` when `SERVE_UI` and built; defaults `API_ORIGIN` to `http://127.0.0.1:$PORT`.
- `src/schemas/` — zod request/response contracts (single source of truth for validation, types and OpenAPI; the UI imports the types).
- `src/routes/` → `src/services/` → `src/db/`. Routes parse input and shape output; services hold logic and queries.
- `src/lib/` — errors, logger, short-code, URL and API-key helpers. `scripts/keys.ts` — key management CLI.
- `tests/` — vitest + supertest against `createApp()`; `apiWithUi()` (helpers) mounts a UI stub.
- `web/vite.config.ts` — all SvelteKit config (adapter, CSP, root `.env` dir) as `sveltekit({ … })` plugin options; there is no `svelte.config.js`.
- `web/src/` — `env.ts` (declared env vars), `hooks.server.ts` (session cookie → `GET /api/me` → `locals`), `lib/server/` (`api()` client, session cookie, config), `lib/types.ts` (type-only re-exports of `src/schemas`), `routes/` (`/`, `/login`, `/logout`, `+error.svelte`).

## Conventions
- **Contracts first:** add/modify the zod schema in `src/schemas`, then the route, then register it in `src/openapi.ts`.
- **Errors:** throw `AppError(code, message, details?)` (`src/lib/errors.ts`). Envelope is always `{ error: { code, message, details? } }`. Zod errors → 400 `VALIDATION_ERROR`.
- **Auth:** `Authorization: Bearer tny_…`. Keys are stored as SHA-256 hashes only. `requireApiKey` + `currentKey(req)` from `src/middleware/auth.ts`.
- **Ownership:** every `/api/links*` query filters by the caller's key id; other keys' links are 404.
- **Redirects:** `302` + `Cache-Control: no-store`; click insert + counter increment happen in one transaction.
- **Routing:** JSON parsing, CORS and `jsonCsp` are scoped to `/api`, and `/api/*` never reaches the UI. Unknown code → JSON 404 when `Accept` prefers JSON (curl, `*/*`), else falls through to the UI's 404 page. `RESERVED_CODES` (`src/schemas/links.ts`, case-insensitive) and dotted paths (`/robots.txt`) always go to the UI — **add a new top-level UI page's name there first**.
- **Proxy:** `trust proxy` is `loopback`; the UI forwards the client IP (`X-Forwarded-For`) on its loopback API calls so rate limits stay per user. Don't widen it.
- **TypeScript:** relative imports end in `.ts`; `import type` for types; no enums/namespaces/parameter properties.
- Never commit `.env`. Never log `Authorization` headers or plaintext keys.

### Web UI (`web/`)
- **API client only:** no DB access and no API runtime imports from `web/`. Call the API server-side with `api(event, key, '/api/…')` (`#lib/server/api.ts` → `fetch` to `API_ORIGIN`); contract types come from `#lib/types.ts` (`import type`). Need new data? Add an API endpoint first.
- **Session:** the API key in the httpOnly cookie `teeny_key` (`#lib/server/session.ts`). Protected pages call `requireApiKey(event.locals)`. Never echo the key into a page or log it.
- **SvelteKit 3 specifics:** imports use `#lib/…` (package.json `imports`), not `$lib`; `page` from `$app/state`, not `$app/stores`; env vars are declared with `defineEnvVars` in `src/env.ts` and read from `$app/env/private` (server-only), `dev` from `$app/env`; runes mode is forced.
- **Works without JS:** mutations are form actions in `+page.server.ts`, enhanced with `use:enhance`; JS-only controls render after mount.
- **CSP:** strict nonce-based policy (`style-src 'self'`). Never use inline `style` attributes or inline scripts — use classes, `app.css` or component `<style>`.
- **Style:** `.svelte` files use 2-space indent and single quotes (Biome skips them; svelte-check type-checks them). `.ts` files follow Biome.

## Sub-agents (`.claude/agents/`)
| Agent | Use for | Owns |
|---|---|---|
| `db-architect` | schema, migrations, indexes, complex SQL | `src/db/**`, `drizzle/**` |
| `api-engineer` | routes, middleware, services, contracts, OpenAPI, web UI | per task, **either** `src/**` except `src/db` (+ `scripts/**`) **or** `web/**` |
| `test-engineer` | writing/fixing tests, bug repro | `tests/**`, `vitest.config.ts` |
| `code-reviewer` | pre-commit review (read-only) | — |
| `docs-writer` | README, CLAUDE.md, `.env.example` | `*.md`, `.env.example` |

**Delegation pattern for a feature:** `db-architect` (if schema changes) → `api-engineer` (API) and `test-engineer` **in parallel** (disjoint files; tests are written against the zod contracts), plus a second `api-engineer` owning `web/**` once the contracts are settled → main agent integrates until `pnpm typecheck && pnpm lint && pnpm test` pass (and `pnpm build` if `web/` changed) → `code-reviewer` and `docs-writer` **in parallel** → apply fixes → commit.
Run agents in parallel only when their file ownership doesn't overlap; split one area across several `api-engineer` instances by assigning each an explicit file list.
