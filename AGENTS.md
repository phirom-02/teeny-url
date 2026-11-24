# Teeny-URL

URL shortener: JSON API + React web UI.

- **API (`src/`):** Express 5 + TypeScript 7 on Node 24+ (native type stripping — no build step), PostgreSQL 17 (Docker) via Drizzle ORM, Zod 4 contracts, OpenAPI 3.1 docs at `/docs` (Scalar).
- **UI (`web/`):** pnpm workspace package `@teeny-url/web` — React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + shadcn/ui + TanStack Router + TanStack Form + Zod 4. In production Express serves its static build (`web/dist`), hosting UI + API + docs + redirects on one port.
- **Deployment:** Multi-stage `Dockerfile` + `docker-compose.yml` (`postgres` + `app`).

## Commands

| Task | Command |
|---|---|
| Start Postgres (dev/test) | `docker compose up -d --wait postgres` (container `teeny-url-postgres`, port 5432; also creates `teeny_url_test`) |
| Run full stack in Docker | `docker compose up -d --build` (stops with `docker compose down`) |
| Apply migrations | `pnpm db:migrate` |
| Create / list / revoke API keys | `pnpm key:create <name>` · `pnpm key:list` · `pnpm key:revoke <id-or-prefix>` |
| Dev (API + UI, watch) | `pnpm dev` → UI http://localhost:5173 (Vite, hot reload, proxies `/api`, `/docs`, `/openapi.json`, `/health` to API) + API http://localhost:3000 (`SERVE_UI=false`, docs at `/docs`). Single side: `pnpm dev:api` · `pnpm dev:web` |
| Production build & run | `pnpm build` (UI → `web/dist`) then `pnpm start` → http://localhost:3000. Without `web/dist` or with `SERVE_UI=false`, runs API-only (`GET /` returns service info) |
| Tests | `pnpm test` (real Postgres `teeny_url_test`, no mocks; `tests/web.e2e.test.ts` requires `pnpm build` first or is skipped) |
| Typecheck / lint / format | `pnpm typecheck` (root `tsc` + web `tsc`) · `pnpm lint` · `pnpm format` (Biome: `.ts`/`.tsx`/`.json` incl. `web/`) |
| New migration | edit `src/db/schema.ts` → `pnpm db:generate --name <desc>` → `pnpm db:migrate` |

## Layout

- `src/app.ts` — `createApp({ uiHandler? })`: logger/helmet → `/health`, `/docs`, `/openapi.json` → `/api` (CSP, CORS, JSON body, rate limit, `metaRouter`: `GET /api` + `GET /api/me`, `sessionRouter`: `POST /api/session` + `DELETE /api/session`, `linksRouter`, JSON 404) → `redirectRouter` (`GET /:code`) → UI handler, or (API-only) `GET /` service info + JSON 404 → `errorHandler`.
- `src/server.ts` — mounts the static React UI handler (`src/middleware/ui-static.ts`) when `SERVE_UI` is enabled and `web/dist/index.html` exists.
- `src/schemas/` — Zod request/response contracts (single source of truth for validation, TypeScript types, and OpenAPI).
- `src/routes/` → `src/services/` → `src/db/` — routes parse input and shape output; services hold business logic and queries.
- `src/lib/` — errors, logger, short-code, URL, and API-key helpers. `scripts/keys.ts` — API key CLI.
- `tests/` — Vitest + Supertest against `createApp()`; `apiWithUi()` (`tests/helpers.ts`) mounts a stub UI handler; `tests/web.e2e.test.ts` mounts the real `web/dist` static handler.
- `web/vite.config.ts` — Vite 8 + React + Tailwind CSS v4 + `@/` alias + dev proxy to `API_ORIGIN` (defaults to `http://localhost:3000`).
- `web/src/` — `main.tsx`, `router.tsx` (TanStack Router route tree), `index.css` (Tailwind v4 + shadcn/ui theme tokens), `lib/` (`api.ts` fetch client, `schemas.ts` / `types.ts`, `utils.ts` `cn`), `components/` (`ui/*` shadcn primitives, `Logo.tsx`, `CopyButton.tsx`), `routes/` (`RootLayout`, `HomePage`, `LoginPage`, `NotFoundPage`).
- `.agentic-workflows/` — vendor-neutral agent workspace (`agents/` holds specialized role definitions with disjoint file ownership; `worktrees/` holds gitignored shared git worktrees for isolated parallel agent work; extensible for workflows, skills, and templates).

## Conventions

### API & Shared (`src/`, `scripts/`)
- **Contracts first:** add/modify the Zod schema in `src/schemas/`, then update the route/service, then register it in `src/openapi.ts`.
- **Errors:** throw `new AppError(code, message, details?)` (`src/lib/errors.ts`). Envelope is always `{ error: { code, message, details? } }`. Zod errors → `400 VALIDATION_ERROR`.
- **Auth & Sessions:** `Authorization: Bearer tny_…` (API clients) or `httpOnly` cookie `teeny_key` (browser UI, managed by `POST /api/session` and `DELETE /api/session`). Only SHA-256 hashes are stored. Use `requireApiKey` + `currentKey(req)` from `src/middleware/auth.ts`.
- **CSRF on cookie auth:** `POST /api/session`, `DELETE /api/session`, and any state-changing `/api/*` request authenticated via cookie (rather than `Authorization: Bearer`) must pass a same-origin `Origin` check; cross-origin or missing-`Origin` requests return `403 FORBIDDEN`.
- **Ownership:** every `/api/links*` query filters by the caller's key id; other keys' links return `404` (never `403`).
- **Redirects:** `302` + `Cache-Control: no-store`; click insert + counter increment happen in one transaction. `HEAD` does not count clicks.
- **Routing:** JSON parsing (16 kB limit), CORS, and `jsonCsp` are scoped to `/api`, and `/api/*` never reaches the UI. Unknown codes → JSON `404` when `Accept` prefers JSON (curl, `*/*`), otherwise fall through to the UI handler (which serves `index.html` with HTTP `404`). `RESERVED_CODES` (`src/schemas/links.ts`, case-insensitive) and dotted paths (`/robots.txt`, `/favicon.svg`) always bypass redirects and go to the UI — **add any new top-level UI page name there first**.
- **Proxy:** `trust proxy` is `loopback` + `TRUST_PROXY` env (extra reverse proxies). Never widen `trust proxy` in code.
- **TypeScript:** relative imports end in `.ts`; use `import type` for types; no enums, namespaces, or parameter properties (`erasableSyntaxOnly`).
- **Secrets:** never commit `.env`; never log `Authorization` headers, cookies, or plaintext keys.

### Web UI (`web/`)
- **API client only:** no database access and no API server runtime imports from `web/`. Call the API via `web/src/lib/api.ts` (`fetch` with `credentials: 'same-origin'`) against same-origin `/api/*`; share contract types/schemas cleanly without pulling Node/server modules into the browser bundle. Need new data? Add an API endpoint first.
- **Session & privacy:** the API key lives exclusively in the `httpOnly` cookie `teeny_key` set by `POST /api/session` and cleared by `DELETE /api/session`. Never store keys in `localStorage`/`sessionStorage`, never echo plaintext keys into the DOM or console.
- **React + TanStack + Tailwind + shadcn/ui:**
  - Use **TanStack Router** (`@tanstack/react-router`) for type-safe routing, auth route guards (`beforeLoad`), and 404/error views.
  - Use **TanStack Form** (`@tanstack/react-form`) + **Zod** for all forms and client-side validation, mapping API `400 VALIDATION_ERROR` (`details[]`) and `409 ALIAS_TAKEN` errors back to field/form errors.
  - Use **Tailwind CSS v4** and **shadcn/ui** components in `web/src/components/ui/` with `@/` path aliases (`web/tsconfig.json` & `web/vite.config.ts`). Follow OS light/dark theme tokens.
- **CSP:** Express serves the UI with strict `script-src 'self'` and `style-src 'self'` (`frame-ancestors 'none'`). Never use inline `style="..."` attributes or inline `<script>` tags — use Tailwind utility classes or `web/src/index.css`.
- **Style:** `.ts`, `.tsx`, and `.json` files in `web/` follow Biome (`pnpm lint` / `pnpm format`).

## Agent Roles (`.agentic-workflows/agents/`)

Specialized agent prompts live in `.agentic-workflows/agents/` with disjoint file ownership so multiple agents can work in parallel without merge conflicts. Isolated git worktrees for any agent live under `.agentic-workflows/worktrees/` (gitignored). Any agent platform (Claude Code, Codex, Cursor, OpenCode, Antigravity, etc.) can load a role file as instructions when delegating work.

| Role | File | Use for | Owns | Access |
|---|---|---|---|---|
| `db-architect` | `.agentic-workflows/agents/db-architect.md` | Schema, migrations, indexes, complex SQL | `src/db/**`, `drizzle/**` | read-write |
| `api-engineer` | `.agentic-workflows/agents/api-engineer.md` | Express routes, middleware, services, Zod contracts, OpenAPI, key CLI | `src/**` (except `src/db/**`), `scripts/**` | read-write |
| `web-engineer` | `.agentic-workflows/agents/web-engineer.md` | React pages, TanStack Router/Form, Zod forms, Tailwind/shadcn UI, API client | `web/**` | read-write |
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
