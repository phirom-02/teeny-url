# Teeny-URL

A small URL shortener with a JSON API and a React web UI. You create short links with an API key, and the service redirects visitors and counts their clicks.

**Stack:** Express 5 · TypeScript run directly by Node 24 (type stripping, no build step for the API) · React 19 + Vite + Tailwind CSS v4 + shadcn/ui + TanStack Router + TanStack Form + Zod web UI (static build served by Express) · PostgreSQL 17 in Docker · Drizzle ORM · zod 4 contracts → OpenAPI 3.1 → Scalar docs · pino · Biome · vitest + supertest · pnpm workspace

## Features

- **Web UI:** sign in with an API key, shorten a URL (with an optional alias) and copy the result, and see your 5 most recent links with their click counts. Built with React 19, Tailwind CSS v4, shadcn/ui, TanStack Router, TanStack Form, and Zod, following the OS light/dark setting.
- **One server:** in production, Express serves the built UI (`web/dist`), the JSON API, the docs and the redirects on one port.
- **Short links:** random 7-character base62 codes, or a custom alias of your choice.
- **Redirects:** `302` with `Cache-Control: no-store`, so every visit reaches the server and is counted. `HEAD` requests are not counted.
- **Click stats:** total clicks, daily counts for the last 30 days (UTC), and the top 5 referrers. Only the referrer's hostname is stored.
- **API keys:** keys start with `tny_` and only their SHA-256 hash is stored. Each link is private to the key that created it; other keys get `404`.
- **Contracts first:** zod schemas drive request validation, the TypeScript types (the UI imports them type-only), the OpenAPI 3.1 document and the interactive docs at `/docs`.
- **Hardened defaults:** a single error envelope, per-IP rate limits, helmet security headers, strict CSPs (`script-src 'self'`, `style-src 'self'`, zero inline scripts/styles), same-origin CSRF checks on cookie-authenticated mutations, CORS on `/api` only, an `X-Request-Id` on every response, and structured pino logs that never contain `Authorization` headers or cookies.
- **No build step for the API:** `node src/server.ts` runs the TypeScript as-is. Only the UI is built (`pnpm build`).
- **Real tests:** vitest + supertest against a real Postgres test database, with no mocks.

## Quick start

**Requirements:**

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 24.2 | Runs `.ts` natively. `src/db/migrate.ts` uses `import.meta.main` (24.2+) |
| pnpm | tested with 12.5 | `pnpm-workspace.yaml` pre-approves esbuild's build script, so no `pnpm approve-builds` step is needed |
| Docker | with Compose v2 | Runs Postgres 17 |

```sh
pnpm install
cp .env.example .env
pnpm docker:up              # Postgres 17 container "teeny-url-postgres" on :5432
pnpm db:migrate             # apply migrations to the dev database
pnpm key:create my-laptop   # prints a tny_… key ONCE — copy it
pnpm dev                    # UI http://localhost:5173 · API http://localhost:3000 · docs /docs
```

Open http://localhost:5173 and paste the key to sign in. `pnpm dev` runs the API and the Vite React dev server (with hot reload and a same-origin proxy for `/api`, `/docs`, `/openapi.json`, and `/health`) side by side.

To run it the way production does, with one server on :3000 for the UI, API, docs and redirects, use this instead of `pnpm dev`:

```sh
pnpm build && pnpm start    # then open http://localhost:3000
```

On its first start, the container also creates `teeny_url_test`, the database that `pnpm test` uses. The curl examples below read your key from an environment variable:

```sh
export TEENY_KEY='tny_…'    # replace with the key printed by key:create
```

## Web UI

The UI is a React 19 SPA in `web/` built with Vite, Tailwind CSS v4, shadcn/ui, TanStack Router, TanStack Form, and Zod. It is a pure client of the JSON API: it calls same-origin `/api/*` endpoints and never touches the database or stores API keys in browser storage (`localStorage` / `sessionStorage`).

| Path | Page |
|---|---|
| `/login` | Sign in by pasting an API key (`POST /api/session`). Signed-in visitors are redirected to `/` |
| `/` | Shorten form: long URL plus an optional alias. The new short link appears with a **Copy** button. Below the form are your 5 most recent links with their click counts. Signed-out visitors are redirected to `/login` |
| anything else | Styled error page: "This short link doesn't exist" for an unknown code, "Page not found", or a notice when the API is down or rate limited |

| Topic | Behavior |
|---|---|
| Session | The API key lives in the `httpOnly` cookie `teeny_key` (`SameSite=Lax`, `Secure` over https, kept for 30 days), managed via `POST /api/session` and `DELETE /api/session`. Client JavaScript can never read it, and the key is never echoed into HTML or stored in `localStorage`. There is no server-side session store, so **Sign out only removes the cookie from that browser — the key itself stays valid**. If a device with a signed-in session is lost, revoke the key (`pnpm key:revoke`) |
| Key checks | On navigation the UI checks the session via `GET /api/me`. A revoked or unknown cookie key returns `401` and clears the cookie, signing the visitor out. UI API calls count against the visitor's `/api/*` rate limit |
| Security | Strict CSP (`script-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`) with zero inline scripts or inline `style` attributes. Cookie-authenticated mutations (`POST`/`PUT`/`PATCH`/`DELETE`) and `/api/session` enforce a same-origin `Origin`/`Referer` check and reject cross-site requests with `403 FORBIDDEN`. Authenticated API responses are sent with `Cache-Control: private, no-store` |
| Proxies | Behind a reverse proxy on another host, add its IP/CIDR to `TRUST_PROXY` so `req.protocol`/`req.ip` reflect `X-Forwarded-*` headers (used for `Secure` cookies, same-origin checks, and per-IP rate limiting) |

## API usage

All examples assume the API is on `http://localhost:3000`, which is the case with both `pnpm dev` and `pnpm start`. The responses below come from a real run, pretty-printed, with headers trimmed and the key prefix replaced by a placeholder.

**Check your key:**

```sh
curl -s http://localhost:3000/api/me -H "Authorization: Bearer $TEENY_KEY"
```

```json
{ "name": "my-laptop", "prefix": "tny_AbCd1234" }
```

**Create a link with a random code:**

```sh
curl -s -X POST http://localhost:3000/api/links \
  -H "Authorization: Bearer $TEENY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/a/very/long/path?utm_source=newsletter"}'
```

```json
{
  "code": "UCu1ank",
  "shortUrl": "http://localhost:3000/UCu1ank",
  "targetUrl": "https://example.com/a/very/long/path?utm_source=newsletter",
  "isCustom": false,
  "clickCount": 0,
  "lastClickedAt": null,
  "createdAt": "2026-10-24T18:03:03.816Z"
}
```

The response is `201 Created` with a `Location: /api/links/UCu1ank` header.

**Create a link with a custom alias:**

```sh
curl -s -X POST http://localhost:3000/api/links \
  -H "Authorization: Bearer $TEENY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/launch", "alias": "launch-day"}'
```

```json
{
  "code": "launch-day",
  "shortUrl": "http://localhost:3000/launch-day",
  "targetUrl": "https://example.com/launch",
  "isCustom": true,
  "clickCount": 0,
  "lastClickedAt": null,
  "createdAt": "2026-10-24T18:03:03.836Z"
}
```

Creating the same alias a second time returns `409 ALIAS_TAKEN`.

**Follow a link.** Redirects are public, so no key is needed:

```sh
curl -i http://localhost:3000/launch-day
```

```http
HTTP/1.1 302 Found
Cache-Control: no-store
Location: https://example.com/launch
X-Request-Id: 47ae240b-99e4-495a-8261-8a2c68fe24ca
```

When a request sends a `Referer` header, only its hostname is recorded. Without one, the click is counted as `direct`. A `HEAD` request (`curl -I`) returns the same redirect without counting a click. An unknown code returns a JSON `404` to curl, while a browser gets the UI's 404 page (see [Routing](#routing)).

```sh
curl -s -o /dev/null -H "Referer: https://news.ycombinator.com/item?id=1" http://localhost:3000/launch-day
```

**List your links.** Results are sorted newest first and paginated with `limit` (1–100, default 20) and `offset` (default 0):

```sh
curl -s "http://localhost:3000/api/links?limit=1&offset=0" -H "Authorization: Bearer $TEENY_KEY"
```

```json
{
  "data": [
    {
      "code": "launch-day",
      "shortUrl": "http://localhost:3000/launch-day",
      "targetUrl": "https://example.com/launch",
      "isCustom": true,
      "clickCount": 4,
      "lastClickedAt": "2026-10-24T18:03:15.207Z",
      "createdAt": "2026-10-24T18:03:03.836Z"
    }
  ],
  "pagination": { "limit": 1, "offset": 0, "total": 2 }
}
```

**Get a link's click stats:**

```sh
curl -s http://localhost:3000/api/links/launch-day/stats -H "Authorization: Bearer $TEENY_KEY"
```

```jsonc
{
  "code": "launch-day",
  "totalClicks": 4,
  "lastClickedAt": "2026-10-24T18:03:15.207Z",
  "clicksByDay": [
    { "date": "2026-09-25", "clicks": 0 },
    // … 27 more days, oldest first, zero-filled …
    { "date": "2026-10-23", "clicks": 0 },
    { "date": "2026-10-24", "clicks": 4 }
  ],
  "topReferrers": [
    { "referrer": "news.ycombinator.com", "clicks": 2 },
    { "referrer": "direct", "clicks": 1 },
    { "referrer": "www.reddit.com", "clicks": 1 }
  ]
}
```

**Delete a link:**

```sh
curl -i -X DELETE http://localhost:3000/api/links/UCu1ank -H "Authorization: Bearer $TEENY_KEY"
```

```http
HTTP/1.1 204 No Content
```

This also deletes the link's click history, and the short URL returns `404` afterwards.

**Errors.** Every error uses the same envelope. Here, an `ftp://` URL with an alias that is too short:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [
      { "path": "url", "message": "Must be a valid http or https URL" },
      { "path": "alias", "message": "Alias must be 3–32 characters: letters, digits, \"-\" or \"_\"" }
    ]
  }
}
```

## API reference

Interactive docs are served at [`/docs`](http://localhost:3000/docs) (Scalar) and the raw spec at [`/openapi.json`](http://localhost:3000/openapi.json). The `/docs` page loads Scalar from jsDelivr, so the browser needs internet access to show it.

| Method | Path | Auth | Description | Success |
|---|---|---|---|---|
| `GET` | `/` | — | The web UI. Without the UI mounted, the same JSON as `GET /api` | `200` |
| `GET` | `/api` | — | Service name, version and docs path | `200` |
| `GET` | `/api/me` | Bearer / Cookie | Name and display prefix of the calling key: `{ "name", "prefix" }` | `200` |
| `POST` | `/api/session` | Same-origin | Validate `{ "key" }` and set the `httpOnly` `teeny_key` session cookie | `200` |
| `DELETE` | `/api/session` | Same-origin | Clear the `teeny_key` session cookie | `204` |
| `GET` | `/health` | — | Uptime and database reachability; `503` with `"status": "degraded"` if the DB is down; never cached | `200` |
| `GET` | `/docs` | — | Scalar API reference UI | `200` |
| `GET` | `/openapi.json` | — | OpenAPI 3.1 document | `200` |
| `POST` | `/api/links` | Bearer / Cookie | Create a link: body `{ "url", "alias"? }` | `201` + `Location` |
| `GET` | `/api/links` | Bearer / Cookie | List your links, newest first (`?limit=1–100&offset=0`) | `200` |
| `GET` | `/api/links/{code}` | Bearer / Cookie | Get one of your links | `200` |
| `DELETE` | `/api/links/{code}` | Bearer / Cookie | Delete one of your links and its clicks | `204` |
| `GET` | `/api/links/{code}/stats` | Bearer / Cookie | Click stats: total, last 30 days, top referrers | `200` |
| `GET` / `HEAD` | `/{code}` | — | Redirect to the target. `GET` counts a click; `HEAD` does not | `302` |

API clients send `Authorization: Bearer tny_…`. Browser sessions authenticate with the `httpOnly` `teeny_key` cookie (mutations require a same-origin `Origin`/`Referer` header).

### Routing

Express matches requests in this order:

| Request | Result |
|---|---|
| `/health`, `/docs`, `/openapi.json` | Served by Express |
| `/api` and `/api/*` | Always the JSON API, never the UI. Unknown paths get a JSON `404 NOT_FOUND`, even from a browser |
| `GET /{code}` for an existing link | `302` redirect, whatever the client |
| `GET /{code}` that doesn't exist, from an API client (`Accept` prefers JSON: `application/json`, `*/*` or no `Accept`, as with curl) | JSON `404 NOT_FOUND` (`Link not found`) |
| `GET /{code}` that doesn't exist, from a browser (`Accept: text/html`) | HTTP `404` serving the UI's HTML shell so React Router renders "This short link doesn't exist" |
| A reserved word, case-insensitively (see Aliases below), or a path containing a dot (`/robots.txt`, `/favicon.svg`) | Never looked up as a code (no DB query, no redirect rate limit); goes to the UI |
| Everything else (known UI routes `/`, `/login`, and `/assets/*` bundles) | Served by the static UI handler (`web/dist`) |

Without the UI mounted (`SERVE_UI=false`, or `web/dist` missing), everything that would go to the UI gets a JSON `404`, and `GET /` returns the service info.

**Upgrading from the API-only version:** the service info moved from `GET /` to `GET /api`, and `login`, `logout`, `links`, `settings`, `account` and `_app` became reserved words. An existing link whose code matches one of them (in any case) stops redirecting; find them with:

```sh
docker exec teeny-url-postgres psql -U teeny -d teeny_url -c "SELECT code FROM links WHERE lower(code) IN ('login','logout','links','settings','account','_app');"
```

### Rules

| Topic | Behavior |
|---|---|
| Random codes | 7 characters of base62 (`0-9A-Za-z`) from a cryptographic RNG; retried on collision or when the code spells a reserved word |
| Aliases | Match `[A-Za-z0-9_-]{3,32}` and are case-sensitive (`Launch-Day` and `launch-day` are different links). They are unique across all keys. Reserved words, checked case-insensitively: `api`, `docs`, `health`, `openapi`, `admin`, `static`, and the UI paths `login`, `logout`, `links`, `settings`, `account`, `_app` |
| Target URLs | `http`/`https` only, at most 2048 characters, and not pointing back at the service: same host and port as `BASE_URL`, including other spellings such as `LOCALHOST`, a trailing dot, or (for a loopback `BASE_URL`) `127.x.x.x`, `[::1]` and `0.0.0.0` |
| Request body | `/api/*` only: JSON, at most 16 kB; larger bodies get `413`. Express does not parse bodies outside `/api` |
| Redirects | `302` + `Cache-Control: no-store`. A `GET` updates the click counter and inserts a click row in a single transaction. `HEAD` is not counted |
| Click data | Referrer: lowercased hostname only, with no path or query; `direct` when there is no `Referer`. User agent: truncated to 512 characters |
| Stats | `clicksByDay` covers the last 30 UTC days including today, oldest first, with zeros for days without clicks. `topReferrers` lists the top 5 by clicks |
| Ownership | A link is visible only to the key that created it. Other keys get `404` (not `403`). Revoking a key does not delete its links, which keep redirecting |
| Rate limit | Per client IP: 120 requests per minute on `/api/*`, and 300 per minute on redirects (`/{code}`), with IETF draft-8 `RateLimit` / `RateLimit-Policy` headers. Going over returns `429` + `Retry-After`. `/health`, `/docs`, `/openapi.json` and static UI files are not limited, but the UI's `/api/*` calls count toward the visitor's `/api/*` limit. `trust proxy` is `loopback` plus anything in `TRUST_PROXY`: `X-Forwarded-For` is honored only from those addresses, so put a reverse proxy that runs on another host into `TRUST_PROXY` |
| CORS | Open (`*`) on `/api/*` only, exposing `Location`, `X-Request-Id`, `RateLimit`, `RateLimit-Policy` and `Retry-After`. UI pages are not CORS-enabled |
| Request IDs | Every response has an `X-Request-Id`. An incoming one is reused if it matches `[A-Za-z0-9._:-]{1,128}` |

### Errors

```json
{ "error": { "code": "NOT_FOUND", "message": "Link not found" } }
```

`code` is stable and machine-readable, and `message` is for humans. `details` is optional. For `VALIDATION_ERROR` it is a list of `{ path, message }`.

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body, query or path parameter; malformed JSON; reserved alias; URL pointing at the service itself |
| `UNAUTHORIZED` | 401 | Missing, malformed, unknown or revoked API key. The response includes a `WWW-Authenticate: Bearer` header |
| `FORBIDDEN` | 403 | Cross-origin or missing-origin cookie-authenticated mutation or session request |
| `NOT_FOUND` | 404 | Unknown code (API clients), a link owned by another key, or an unknown `/api` route |
| `ALIAS_TAKEN` | 409 | Alias already in use by any key |
| `PAYLOAD_TOO_LARGE` | 413 | Request body over 16 kB |
| `RATE_LIMITED` | 429 | Over 120 requests per minute on `/api/*`, or 300 on redirects. `Retry-After` gives the seconds to wait |
| `INTERNAL_ERROR` | 500 | Unexpected failure. The server logs it and returns a generic message |

## API keys

Manage keys on the server with the CLI. Each command reads `DATABASE_URL` from `.env`. The same keys sign in to the web UI.

| Command | What it does |
|---|---|
| `pnpm key:create <name>` | Creates a key and prints its id, display prefix and full `tny_…` key. The full key is shown **once**; only its SHA-256 hash and a 12-character prefix (e.g. `tny_AbCd1234`) are stored. Names are 1–64 characters |
| `pnpm key:list` | Lists all keys, active and revoked, with prefix, creation time, last use and status |
| `pnpm key:revoke <id-or-prefix>` | Revokes a key by UUID or display prefix, effective immediately (the UI signs out on the next API request). If a prefix matches more than one active key, revoke by id |

A key is `tny_` followed by 32 base64url characters (36 characters in total).

## Configuration

Copy `.env.example` to `.env`. The API validates its variables with zod at startup (`src/env.ts`) and exits with a readable message if one is invalid. `.env` is loaded with Node's `--env-file-if-exists`. Variables already set in the shell take precedence over `.env`.

| Variable | Default | Used by | Description |
|---|---|---|---|
| `POSTGRES_USER` | `teeny` | docker compose | Database user |
| `POSTGRES_PASSWORD` | `teeny` | docker compose | Database password |
| `POSTGRES_DB` | `teeny_url` | docker compose | Dev database name |
| `POSTGRES_PORT` | `5432` | docker compose | Host port mapped to the container (bound to `127.0.0.1` only) |
| `DATABASE_URL` | **required** | API, key CLI, migrations, drizzle-kit | e.g. `postgres://teeny:teeny@localhost:5432/teeny_url` |
| `PORT` | `3000` | API | HTTP listen port |
| `BASE_URL` | `http://localhost:3000` | API | Public origin: `http(s)://host[:port]`, no path. Used to build `shortUrl`, as the OpenAPI `servers` URL, by the docs CSP, and by the check that rejects links to the service itself |
| `NODE_ENV` | `development` | API | `development`: pretty logs through pino-pretty, a dev dependency. `production`: JSON logs. `test`: silent logs and no rate limit |
| `LOG_LEVEL` | `info` | API | `fatal` · `error` · `warn` · `info` · `debug` · `trace` · `silent` |
| `SERVE_UI` | `true` | API | `true`/`1`: mount the built UI (`web/dist`). `false`/`0`: API only, and `GET /` returns the service info. `pnpm dev` (`dev:api`) always sets `false`. If `web/dist` is missing, the server logs a warning and runs API-only |
| `TRUST_PROXY` | unset | API | Extra trusted reverse proxies, comma-separated: IPs, CIDRs or Express presets (`uniquelocal`, `linklocal`), e.g. `10.0.0.0/8`. Loopback is always trusted. Needed when a proxy on another host terminates TLS: it makes `req.protocol`/`req.ip` (and so same-origin CSRF checks, `Secure` cookies and rate limits) use the proxy's `X-Forwarded-*` headers |
| `VITE_API_ORIGIN` | `http://localhost:3000` | Vite dev proxy (`web/vite.config.ts`) | Target origin for the Vite dev server's `/api`, `/docs`, `/openapi.json`, and `/health` proxy during `pnpm dev`. Unused in production builds |

If you change the Postgres port or credentials, update `DATABASE_URL` to match. Also update `tests/test-env.ts`, which hard-codes `postgres://teeny:teeny@localhost:5432/teeny_url_test`. If you change `PORT`, update `BASE_URL` (and set `VITE_API_ORIGIN=http://localhost:<PORT>` for `pnpm dev`).

## Project structure

```
.
├── .agentic-workflows/      # vendor-neutral agent workspace (agents/, gitignored worktrees/, future workflows)
├── AGENTS.md                # shared project conventions for AI coding agents
├── Dockerfile               # multi-stage build (UI builder + Node 24 runtime)
├── docker-compose.yml       # Postgres 17 (teeny-url-postgres) + app service
├── docker/postgres/init.sql # creates teeny_url_test on first container start
├── drizzle/                 # generated SQL migrations (never hand-edited)
├── scripts/keys.ts          # API key CLI (create / list / revoke)
├── src/                     # the API (Express, no build step)
│   ├── app.ts               # createApp({ uiHandler? }): system routes → /api → redirects → UI or JSON 404 → errorHandler
│   ├── server.ts            # mounts web/dist via createUiHandler if present, listen + graceful shutdown
│   ├── env.ts               # zod-validated environment
│   ├── openapi.ts           # OpenAPI 3.1 document built from the zod schemas
│   ├── db/                  # Drizzle schema, pg pool, migrator
│   ├── lib/                 # errors, logger, cookies/CSRF, short codes, URL + API key helpers
│   ├── middleware/          # auth, rate limit, CSP, static UI handler, UI headers, not-found, error handler
│   ├── routes/              # HTTP layer: meta, session, links, redirect, health, docs
│   ├── schemas/             # zod contracts: validation, types and OpenAPI in one place
│   └── services/            # business logic and queries
├── tests/                   # vitest + supertest; unit/ holds pure helper tests
└── web/                     # the web UI: React 19 workspace package @teeny-url/web
    ├── vite.config.ts       # React + Tailwind CSS v4 plugins, @/ alias, dev proxy
    ├── components.json      # shadcn/ui configuration
    ├── index.html           # SPA HTML entry point
    ├── public/              # favicon.svg, robots.txt
    ├── src/
    │   ├── main.tsx         # React root mount
    │   ├── router.tsx       # TanStack Router tree + session auth guards
    │   ├── index.css        # Tailwind v4 + shadcn/ui theme tokens (OS light/dark)
    │   ├── components/      # ui/ (shadcn primitives), Logo, CopyButton
    │   ├── lib/             # api.ts (same-origin fetch), schemas.ts (Zod forms), types.ts, utils.ts
    │   └── routes/          # RootLayout, HomePage, LoginPage, NotFoundPage, ErrorPage
    └── dist/                # `pnpm build` output (git-ignored), served by src/server.ts
```

## Development

### Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Runs `dev:api` and `dev:web` in parallel. Open http://localhost:5173 |
| `pnpm dev:api` | The API with `node --watch` on `PORT` (:3000) and `SERVE_UI=false` |
| `pnpm dev:web` | The Vite React dev server (:5173, hot reload, proxies `/api` to the API). Signing in needs the API running |
| `pnpm build` | Builds the React UI into `web/dist`. The API needs no build |
| `pnpm start` | One server on `PORT`, without watch: UI (if built), API, docs and redirects |
| `pnpm typecheck` | `tsc --noEmit` for the API (TypeScript 7), then `tsc --noEmit` for `web/` |
| `pnpm lint` | `biome check .`: lint, format check and import order across `.ts`, `.tsx`, `.json`, and `.css` (including `web/`) |
| `pnpm format` | `biome check --write .` (apply fixes) |
| `pnpm test` / `pnpm test:watch` | Run the vitest suite once / in watch mode |
| `pnpm db:generate --name <desc>` | Generate a migration from `src/db/schema.ts` into `drizzle/` |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `pnpm db:studio` | Open Drizzle Studio (https://local.drizzle.studio) |
| `pnpm key:create` / `key:list` / `key:revoke` | API key CLI (see [API keys](#api-keys)) |
| `pnpm docker:up` / `docker:down` | Start Postgres and wait until it is healthy / stop it. The data volume is kept |

Before committing, run `pnpm typecheck && pnpm lint && pnpm test`.

### Tests

- The suite needs the Postgres container to be running (`pnpm docker:up`). It uses `teeny_url_test` and never touches your dev data.
- vitest's global setup (`tests/global-setup.ts`) applies migrations to the test database automatically, and `tests/setup.ts` truncates every table before each test.
- HTTP tests call `createApp()` through supertest, so no server or port is involved. Test files run one at a time because they share the database.
- UI routing tests (`tests/ui.test.ts`) mount a stub handler with `createApp({ uiHandler })`, so they don't need `pnpm build`.
- End-to-end tests (`tests/web.e2e.test.ts`) mount the real static React build (`web/dist`) via `createUiHandler` and drive sign-in, session cookies, shorten, sign-out, CSRF, static assets, and strict CSP over HTTP. They are **skipped when `web/dist` is missing** — run `pnpm build` first (always after changing `web/`).
- `NODE_ENV=test` silences logs and disables the rate limit.
- If `teeny_url_test` is missing because your Docker volume predates `init.sql`, create it with `docker exec teeny-url-postgres createdb -U teeny teeny_url_test`.

### Database migrations

1. Edit `src/db/schema.ts`.
2. Run `pnpm db:generate --name add_link_expiry` and review the new SQL file in `drizzle/`.
3. Run `pnpm db:migrate` to apply it to the dev database.
4. Run `pnpm test`, which migrates the test database automatically.

Don't edit files in `drizzle/` by hand. If an unreleased migration is wrong, delete it and generate it again. Use `pnpm db:studio` to browse the data.

### Working with AI coding agents

`.agentic-workflows/agents/` defines six vendor-neutral agent roles with disjoint file ownership, so multiple agents can work in parallel without conflicts. `AGENTS.md` holds the shared conventions they all follow.

| Agent | Use for | Owns |
|---|---|---|
| `db-architect` | Schema changes, migrations, indexes, non-trivial SQL | `src/db/**`, `drizzle/**` |
| `api-engineer` | Express routes, middleware, services, zod contracts, OpenAPI, key CLI | `src/**` (except `src/db/**`), `scripts/**` |
| `web-engineer` | React pages, TanStack Router/Form, shadcn/ui components, Tailwind CSS | `web/**` |
| `test-engineer` | Writing and fixing tests, E2E tests, reproducing bugs as failing tests | `tests/**`, `vitest.config.ts`. Never edits `src/` or `web/` |
| `code-reviewer` | Pre-commit review of correctness, security, contracts and conventions; runs all checks | Nothing (read-only) |
| `docs-writer` | README, AGENTS.md, `.env.example`, OpenAPI descriptions | `*.md`, `.env.example`, `description`/`example` text in zod `.meta()` |

**Delegation pattern for a feature:**

1. `db-architect`, if the schema changes.
2. `api-engineer` for the API contracts, routes, services and OpenAPI, in parallel with `test-engineer` once contracts are agreed.
3. `web-engineer` in parallel once the zod contracts in `src/schemas/` are settled.
4. The main agent integrates the work until `pnpm typecheck && pnpm lint && pnpm test` pass (run `pnpm build` first if `web/` changed).
5. `code-reviewer` and `docs-writer` **in parallel**.
6. Apply the fixes, then commit.

Run agents in parallel only when their file ownership doesn't overlap. To split one area across several agents, give each one an explicit list of files.

## Roadmap

- Links dashboard in the UI: all links with pagination, search and delete
- Per-link stats page with a clicks-per-day chart and top referrers
- API key management in the UI (create, list, revoke), which needs new API endpoints
- Link expiration (`expiresAt`), with expired links no longer redirecting
- A QR code for each short link
- Browser tests for the UI (e.g. Playwright)
- Opaque server-side sessions instead of the API key in the cookie, so signing out (or out everywhere) doesn't require revoking the key
- Redis cache for hot redirects, with click writes moved off the request path
- Per-key rate limits and quotas
- Bulk link creation
