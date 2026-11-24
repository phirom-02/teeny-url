# Teeny-URL

URL shortener: JSON API + server-rendered web UI.

- **API (`src/`):** Express 5 + TypeScript 7 on Node 24+ (native type stripping — no build step), PostgreSQL 17 (Docker) via Drizzle ORM, Zod 4 contracts, OpenAPI 3.1 docs at `/docs` (Scalar).
- **UI (`web/`):** pnpm workspace package `@teeny-url/web` — SvelteKit 3 + Svelte 5 + Vite 8 + `adapter-node` (TypeScript 6). In production Express mounts its build (`web/build/handler.js`), serving UI + API + docs + redirects on one port.
- **Deployment:** Multi-stage `Dockerfile` + `docker-compose.yml` (`postgres` + `app`).

## Commands

| Task | Command |
|---|---|
| Start Postgres (dev/test) | `docker compose up -d --wait postgres` (container `teeny-url-postgres`, port 5432; also creates `teeny_url_test`) |
| Run full stack in Docker | `docker compose up -d --build` (stops with `docker compose down`) |
| Apply migrations | `pnpm db:migrate` |
| Create / list / revoke API keys | `pnpm key:create <name>` · `pnpm key:list` · `pnpm key:revoke <id-or-prefix>` |
| Dev (API + UI, watch) | `pnpm dev` → UI http://localhost:5173 (Vite, hot reload) + API http://localhost:3000 (`SERVE_UI=false`, docs at `/docs`). Single side: `pnpm dev:api` · `pnpm dev:web` |
| Production build & run | `pnpm build` (UI → `web/build`) then `pnpm start` → http://localhost:3000. Without `web/build` or with `SERVE_UI=false`, runs API-only (`GET /` returns service info) |
| Tests | `pnpm test` (real Postgres `teeny_url_test`, no mocks; `tests/web.e2e.test.ts` requires `pnpm build` first or is skipped) |
| Typecheck / lint / format | `pnpm typecheck` (`tsc` + `svelte-check`) · `pnpm lint` · `pnpm format` (Biome: `.ts`/`.json` incl. `web/`, not `.svelte`) |
| New migration | edit `src/db/schema.ts` → `pnpm db:generate --name <desc>` → `pnpm db:migrate` |

## Layout

- `src/app.ts` — `createApp({ uiHandler? })`: logger/helmet → `/health`, `/docs`, `/openapi.json` → `/api` (CSP, CORS, JSON body, rate limit, `metaRouter`: `GET /api` + `GET /api/me`, `linksRouter`, JSON 404) → `redirectRouter` (`GET /:code`) → UI handler, or (API-only) `GET /` service info + JSON 404 → `errorHandler`.
- `src/server.ts` — loads `web/build/handler.js` when `SERVE_UI` is enabled and built; pins `adapter-node` proxy env vars; defaults `API_ORIGIN` to `http://127.0.0.1:$PORT`.
- `src/schemas/` — Zod request/response contracts (single source of truth for validation, TypeScript types, and OpenAPI; the UI imports types only).
- `src/routes/` → `src/services/` → `src/db/` — routes parse input and shape output; services hold business logic and queries.
- `src/lib/` — errors, logger, short-code, URL, and API-key helpers. `scripts/keys.ts` — API key CLI.
- `tests/` — Vitest + Supertest against `createApp()`; `apiWithUi()` (`tests/helpers.ts`) mounts a stub UI handler; `tests/web.e2e.test.ts` mounts the real `web/build`.
- `web/vite.config.ts` — all SvelteKit config (adapter, nonce CSP, root `.env` dir) as `sveltekit({ … })` plugin options (no `svelte.config.js`).
- `web/src/` — `env.ts` (declared env vars), `hooks.server.ts` (session cookie → `GET /api/me` → `locals`), `lib/server/` (`api()` client, session cookie, config), `lib/types.ts` (type-only re-exports of `src/schemas`), `routes/` (`/`, `/login`, `/logout`, `+error.svelte`).
- `.agentic-workflows/` — vendor-neutral agent workspace (`agents/` holds specialized role definitions with disjoint file ownership; `worktrees/` holds gitignored shared git worktrees for isolated parallel agent work; extensible for workflows, skills, and templates).

## Conventions

### API & Shared (`src/`, `scripts/`)
- **Contracts first:** add/modify the Zod schema in `src/schemas/`, then update the route/service, then register it in `src/openapi.ts`.
- **Errors:** throw `new AppError(code, message, details?)` (`src/lib/errors.ts`). Envelope is always `{ error: { code, message, details? } }`. Zod errors → `400 VALIDATION_ERROR`.
- **Auth:** `Authorization: Bearer tny_…`. Only SHA-256 hashes are stored. Use `requireApiKey` + `currentKey(req)` from `src/middleware/auth.ts`.
- **Ownership:** every `/api/links*` query filters by the caller's key id; other keys' links return `404` (never `403`).
- **Redirects:** `302` + `Cache-Control: no-store`; click insert + counter increment happen in one transaction. `HEAD` does not count clicks.
- **Routing:** JSON parsing (16 kB limit), CORS, and `jsonCsp` are scoped to `/api`, and `/api/*` never reaches the UI. Unknown codes → JSON `404` when `Accept` prefers JSON (curl, `*/*`), otherwise fall through to the UI's 404 page. `RESERVED_CODES` (`src/schemas/links.ts`, case-insensitive) and dotted paths (`/robots.txt`) always bypass redirects and go to the UI — **add any new top-level UI page name there first**.
- **Proxy:** `trust proxy` is `loopback` + `TRUST_PROXY` env (extra reverse proxies). Loopback must remain trusted because the UI forwards `X-Forwarded-For` on loopback API calls so rate limits stay per visitor. Never widen `trust proxy` in code.
- **TypeScript:** relative imports end in `.ts`; use `import type` for types; no enums, namespaces, or parameter properties (`erasableSyntaxOnly`).
- **Secrets:** never commit `.env`; never log `Authorization` headers, cookies, or plaintext keys.

### Web UI (`web/`)
- **API client only:** no database access and no API runtime imports from `web/`. Call the API server-side via `api(event, key, '/api/…')` (`#lib/server/api.ts` → `fetch` to `API_ORIGIN`); import contract types only from `#lib/types.ts` (`import type`). Need new data? Add an API endpoint first.
- **Session:** the API key lives in the `httpOnly` cookie `teeny_key` (`#lib/server/session.ts`). Protected pages call `requireApiKey(event.locals)`. Never echo the key into HTML or log it.
- **SvelteKit 3 specifics:** use `#lib/…` (`web/package.json` `imports`), not `$lib`; `page` from `$app/state`, not `$app/stores`; env vars are declared via `defineEnvVars` in `web/src/env.ts` and read from `$app/env/private` (server-only), `dev` from `$app/env`; runes mode is enforced.
- **Works without JS:** mutations are form actions in `+page.server.ts`, progressively enhanced with `use:enhance`; JS-only controls render only after mount.
- **CSP:** strict nonce-based policy (`style-src 'self'`). Never use inline `style` attributes or inline `<script>` tags — use classes, `app.css`, or component `<style>`.
- **Style:** `.svelte` files use 2-space indent and single quotes (Biome skips them; `svelte-check` type-checks them). `.ts`/`.json` files follow Biome.

## Agent Roles (`.agentic-workflows/agents/`)

Specialized agent prompts live in `.agentic-workflows/agents/` with disjoint file ownership so multiple agents can work in parallel without merge conflicts. Isolated git worktrees for any agent live under `.agentic-workflows/worktrees/` (gitignored). Any agent platform (Claude Code, Codex, Cursor, OpenCode, Antigravity, etc.) can load a role file as instructions when delegating work.

| Role | File | Use for | Owns | Access |
|---|---|---|---|---|
| `db-architect` | `.agentic-workflows/agents/db-architect.md` | Schema, migrations, indexes, complex SQL | `src/db/**`, `drizzle/**` | read-write |
| `api-engineer` | `.agentic-workflows/agents/api-engineer.md` | Express routes, middleware, services, Zod contracts, OpenAPI, key CLI | `src/**` (except `src/db/**`), `scripts/**` | read-write |
| `web-engineer` | `.agentic-workflows/agents/web-engineer.md` | SvelteKit pages, form actions, server API client, components, styling | `web/**` | read-write |
| `test-engineer` | `.agentic-workflows/agents/test-engineer.md` | Vitest + Supertest suites, E2E tests, bug reproduction | `tests/**`, `vitest.config.ts` | read-write |
| `code-reviewer` | `.agentic-workflows/agents/code-reviewer.md` | Pre-commit correctness, security, contract, and convention review | — | read-only |
| `docs-writer` | `.agentic-workflows/agents/docs-writer.md` | `README.md`, `AGENTS.md`, `.env.example`, OpenAPI `.meta()` copy | `*.md`, `.env.example`, `.meta()` text | read-write |

### Delegation Pattern for a Feature
1. **`db-architect`** (only if the schema changes).
2. **`api-engineer`** (contracts, routes, services, OpenAPI) and **`test-engineer`** **in parallel** once the contract shape is agreed.
3. **`web-engineer`** in parallel once Zod contracts in `src/schemas/` are settled.
4. **Integrator (main agent):** run `pnpm build` (if `web/` changed) and verify `pnpm typecheck && pnpm lint && pnpm test`.
5. **`code-reviewer`** and **`docs-writer`** **in parallel**.
6. Apply any review fixes, re-run verification checks, and commit.

Run agents in parallel only when their file ownership does not overlap (or use isolated worktrees under `.agentic-workflows/worktrees/`). When splitting one domain across multiple agents, assign each an explicit file list.
