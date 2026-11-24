# TODO

Actionable backlog for **Teeny-URL**, organized by priority and area.

---

## 1. Immediate Repo Cleanup & Drift Fixes

- [x] **Resolve uncommitted working tree state:** Decide whether to commit or restore the deleted `learning/*` files, and handle the untracked `skills/` directory (add to `.gitignore` if local-only).
- [x] **Reconcile removed `docker:up` / `docker:down` scripts:** Commit `c003a24` removed `docker:up` and `docker:down` from `package.json`, but `pnpm docker:up` is still referenced in `README.md` and `scripts/keys.ts` (connection error hint). Either restore `docker:up` / `docker:down` (targeting `postgres` for local dev) or update all references to `docker compose up -d --wait postgres`.
- [x] **Clean up stale `learning/` config:** Remove `!learning/roadmap.html` from `biome.json` if `learning/` is permanently removed.

---

## 2. Docker & Deployment Hardening

- [x] **Parameterize `docker-compose.yml`:** Replace hardcoded `BASE_URL: http://localhost:8080` with `${BASE_URL:-http://localhost:3000}`, pass through optional `TRUST_PROXY` and `LOG_LEVEL`, and ensure port/origin defaults match.
- [x] **Add app healthcheck & migration workflow in Docker:**
  - Add a `healthcheck` probing `/health` to the `app` service in `docker-compose.yml`.
  - Add an automated migration step (e.g. a one-shot `migrate` service or startup hook running `src/db/migrate.ts`) so fresh deployments initialize the schema automatically.
- [x] **Tighten `Dockerfile` and `.dockerignore`:**
  - Pin the `pnpm` version in `Dockerfile` (or use `corepack` with a `packageManager` field in `package.json`) instead of unpinned `npm install -g pnpm`.
  - Add `web/build`, `web/.svelte-kit`, `skills/`, and `tests/` to `.dockerignore` so local build artifacts and test files are not copied into the Docker build context.
- [ ] **Write a deployment guide:** Document running behind a TLS-terminating reverse proxy (Nginx/Caddy/Traefik), configuring `TRUST_PROXY`, `BASE_URL`, and `API_ORIGIN`, and managing API keys in containerized environments.

---

## 3. Frontend Migration (SvelteKit → React Stack)

Migrate `@teeny-url/web` (`web/`) from SvelteKit 3 + Svelte 5 + `adapter-node` to **React + Tailwind CSS + shadcn/ui + TanStack Router + TanStack Form + Zod**.

- [x] **Decide serving & auth architecture with Express (`src/server.ts`, `src/app.ts`):**
  - Serve static React SPA (`web/dist`) directly from Express via `src/middleware/ui-static.ts` (strict `script-src 'self'` / `style-src 'self'` CSP, immutable `/assets/*` caching, HTTP 200 for known SPA routes, HTTP 404 for unknown paths/short codes).
  - Keep API keys out of `localStorage`/client JS using `httpOnly`, `SameSite=Lax` cookie sessions (`POST /api/session`, `DELETE /api/session`) with same-origin `Origin` CSRF enforcement (`403 FORBIDDEN`) on session endpoints and cookie-authenticated mutations.
  - Preserve Express routing order (`/health`, `/docs`, `/api/*`, `/:code`, then UI fallback), `RESERVED_CODES`, `Cache-Control: private, no-store` on authenticated responses, and strict CSP.
- [x] **Scaffold React + Vite + Tailwind CSS + shadcn/ui in `web/`:**
  - Replace SvelteKit/Svelte/adapter-node/svelte-check dependencies in `web/package.json` with `react`, `react-dom`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/react-router`, `@tanstack/react-form`, and `zod`.
  - Configure Tailwind CSS v4, shadcn/ui (`web/components.json`, theme tokens with OS light/dark support, base primitives: `Button`, `Input`, `Label`, `Card`, `Badge`, `Alert`), and `@/` path aliases in `web/tsconfig.json` and `web/vite.config.ts`.
  - Update `biome.json` (lint/format `.tsx` and Tailwind v4 CSS), `.dockerignore`, and `Dockerfile` (`web/dist`).
- [x] **Set up TanStack Router (`@tanstack/react-router`):**
  - Configure type-safe routing (`web/src/router.tsx`) with `RootLayout` (header, logo, API docs link, active key badge, sign-out control), auth route guards (`beforeLoad` redirecting signed-out users to `/login`), and styled `NotFoundPage` / `ErrorPage` views.
- [x] **Migrate existing pages & forms with TanStack Form + Zod:**
  - Share type-only API contracts via `web/src/lib/types.ts` and client Zod 4 form schemas in `web/src/lib/schemas.ts`.
  - **`/login`:** API key sign-in form using `@tanstack/react-form` + Zod validation, surfacing API errors cleanly and redirecting to `/` on success.
  - **`/`:** Shorten URL + optional custom alias form using `@tanstack/react-form` + Zod, result card with `CopyButton`, and the 5 most recent links list with click counts.
  - **API client layer (`web/src/lib/api.ts`):** Typed `fetch` wrapper (`credentials: 'same-origin'`) handling `{ error: { code, message, details? } }` envelopes, `401` sign-out redirects, `429` rate-limit notices, and `503` API-unreachable states.
- [x] **Update tests, Docker & agent documentation:**
  - Updated `tests/web.e2e.test.ts` to verify the real `web/dist` React build, session cookies, CSRF protection, CSP headers, static assets, and unknown short code 404s.
  - Updated `AGENTS.md`, `README.md`, and `.agentic-workflows/agents/*` (`web-engineer.md`, `api-engineer.md`, `code-reviewer.md`, `test-engineer.md`).

---

## 4. Core Product Features (API + Web UI)

> Note: `RESERVED_CODES` in `src/schemas/links.ts` already reserves `links`, `settings`, and `account` for top-level UI pages.

- [ ] **Links dashboard (`/links`):**
  - Add optional search/filter query parameter (`q`) to `ListLinksQuery` (`src/schemas/links.ts`), `listLinks` (`src/services/links.service.ts`), and `src/openapi.ts`.
  - Build a dedicated `/links` UI page backed by `GET /api/links` and `DELETE /api/links/:code` with pagination, search, copy actions, and delete confirmation.
- [ ] **Per-link analytics page (`/links/$code`):**
  - Wire the existing `GET /api/links/:code/stats` endpoint (`getLinkStats` in `src/services/clicks.service.ts`) into a link detail page.
  - Render a 30-day daily clicks chart and top-5 referrers breakdown using pure SVG/CSS classes (no inline `style=""` attributes, preserving strict `style-src 'self'` CSP).
- [ ] **Link expiration (`expiresAt`):**
  - Add nullable `expires_at` (`timestamptz`) column to `links` in `src/db/schema.ts` and generate a Drizzle migration.
  - Expose optional `expiresAt` in `CreateLinkBody` and `Link` schemas (`src/schemas/links.ts`) and OpenAPI docs.
  - Reject expired links on redirect in `recordClick` / `findTarget` (`src/services/clicks.service.ts`) with appropriate HTTP status (`404` or `410`).
  - Add expiration input and status badge to the web UI.
- [ ] **API key management in API & UI (`/account` or `/settings`):**
  - Add authenticated API endpoints (`GET /api/keys`, `POST /api/keys`, `DELETE /api/keys/:id`) backed by `src/services/api-keys.service.ts`, with Zod contracts and OpenAPI docs.
  - Build a UI page to list keys, create new keys (show plaintext once), and revoke keys.
- [ ] **QR code generation:**
  - Generate downloadable/scannable QR codes for each short link (SVG or PNG `data:` URI, compatible with `img-src 'self' data:` CSP).
- [ ] **Bulk link creation:**
  - Add a batch endpoint (e.g., `POST /api/links/bulk`) with a bounded batch size, Zod validation, and clear per-item or transactional reporting.

---

## 5. Security, Scalability & Quality Engineering

- [ ] **CI pipeline (`.github/workflows/ci.yml`):** Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` against a PostgreSQL 17 service container on pushes and pull requests.
- [ ] **Opaque server-side UI sessions:** Replace storing the raw API key in the `teeny_key` cookie with a DB-backed `sessions` table holding hashed opaque session tokens, enabling true server-side sign-out (and "sign out everywhere") without revoking the underlying API key.
- [ ] **Distributed rate limiting & per-key quotas:**
  - Back `apiRateLimit` and `redirectRateLimit` (`src/middleware/rate-limit.ts`) with a shared Redis store instead of in-memory state so limits persist across restarts and work across multiple replicas.
  - Add per-API-key rate limits and link creation quotas.
- [ ] **Hot-redirect caching & async click ingestion:**
  - Cache `code -> targetUrl` lookups in Redis for low-latency redirects.
  - Move click inserts and counter updates off the synchronous redirect path (e.g., buffered/queued writes) to keep redirect latency minimal under load.
- [ ] **Browser E2E tests (Playwright):** Complement HTTP-level `tests/web.e2e.test.ts` with real browser tests verifying routing, form validation & focus management, `CopyButton` clipboard behavior, and zero CSP console violations.
