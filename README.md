# Teeny-URL

A small URL shortener with a JSON API and a server-rendered web UI. You create short links with an API key, and the service redirects visitors and counts their clicks.

**Stack:** Express 5 · TypeScript run directly by Node 24 (type stripping, no build step for the API) · SvelteKit 3 + Svelte 5 web UI (adapter-node, mounted by Express) · PostgreSQL 17 in Docker · Drizzle ORM · zod 4 contracts → OpenAPI 3.1 → Scalar docs · pino · Biome · vitest + supertest · pnpm workspace

## Features

- **Web UI:** sign in with an API key, shorten a URL (with an optional alias) and copy the result, and see your 5 most recent links with their click counts. Pages are rendered on the server, work without JavaScript, and follow the OS light/dark setting.
- **One server:** in production, Express serves the UI, the JSON API, the docs and the redirects on one port.
- **Short links:** random 7-character base62 codes, or a custom alias of your choice.
- **Redirects:** `302` with `Cache-Control: no-store`, so every visit reaches the server and is counted. `HEAD` requests are not counted.
- **Click stats:** total clicks, daily counts for the last 30 days (UTC), and the top 5 referrers. Only the referrer's hostname is stored.
- **API keys:** keys start with `tny_` and only their SHA-256 hash is stored. Each link is private to the key that created it; other keys get `404`.
- **Contracts first:** zod schemas drive request validation, the TypeScript types (the UI imports them type-only), the OpenAPI 3.1 document and the interactive docs at `/docs`.
- **Hardened defaults:** a single error envelope, per-IP rate limits, helmet security headers, strict CSPs (nonce-based for the UI), CORS on `/api` only, an `X-Request-Id` on every response, and structured pino logs that never contain `Authorization` headers.
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

Open http://localhost:5173 and paste the key to sign in. `pnpm dev` runs the API and the SvelteKit dev server (hot reload) side by side.

To run it the way production does, with one server on :3000 for the UI, API, docs and redirects, use this instead of `pnpm dev`:

```sh
pnpm build && pnpm start    # then open http://localhost:3000
```

On its first start, the container also creates `teeny_url_test`, the database that `pnpm test` uses. The curl examples below read your key from an environment variable:

```sh
export TEENY_KEY='tny_…'    # replace with the key printed by key:create
```

## Web UI

The UI is a SvelteKit app in `web/` that renders every page on the server. It is a client of the JSON API: its server-side code calls `/api/*` with the signed-in key (at `API_ORIGIN`) and never touches the database.

| Path | Page |
|---|---|
| `/login` | Sign in by pasting an API key. The UI checks the key with `GET /api/me`. Signed-in visitors are redirected to `/` |
| `/` | Shorten form: long URL plus an optional alias. The new short link appears with a **Copy** button. Below the form are your 5 most recent links with their click counts. Signed-out visitors get a `303` to `/login` |
| `/logout` | The **Sign out** button in the header (a form `POST`). It deletes the cookie and redirects to `/login` |
| anything else | Styled error page: "This short link doesn't exist" for an unknown code, "Page not found", or a notice when the API is down or rate limited |

| Topic | Behavior |
|---|---|
| Session | The API key itself, in the `httpOnly` cookie `teeny_key` (`SameSite=Lax`, `Secure` over https, kept for 30 days). Page scripts can't read it, and the key is never echoed into a page. There is no server-side session store, so **Sign out only removes the cookie from that browser — the key itself stays valid**. If a device with a signed-in session is lost, revoke the key (`pnpm key:revoke`) |
| Key checks | On every request the UI resolves the cookie with `GET /api/me`. A revoked or unknown key clears the cookie, which signs the visitor out. The UI's API calls count against that visitor's `/api/*` rate limit |
| Without JavaScript | Every form is a plain HTML `POST` (SvelteKit form actions), progressively enhanced when JS runs. Only the Copy button needs JS, and it is hidden without it |
| Security | Nonce-based CSP (`script-src 'self'` + nonce, `style-src 'self'`, `frame-ancestors 'none'`). SvelteKit rejects cross-site form posts with `403`. Signed-in pages are sent with `Cache-Control: private, no-store` |
| Client IP | Before the UI runs, Express sets `X-Forwarded-For` to the client IP it resolved. The UI forwards it on its loopback API calls, and the API trusts loopback proxies (`trust proxy` = `loopback` + `TRUST_PROXY`), so each visitor keeps their own rate-limit bucket. Behind a reverse proxy on another host, add it to `TRUST_PROXY` — otherwise form posts fail the origin check (403) and everyone shares one bucket |

Under `pnpm dev`, the "API docs" link and the short-link host shown next to the alias field point at `API_ORIGIN` (the API on :3000), because Vite serves the UI on :5173.

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
| `GET` | `/` | — | The web UI (signed out: `303` to `/login`). Without the UI mounted, the same JSON as `GET /api` | `200` / `303` |
| `GET` | `/api` | — | Service name, version and docs path | `200` |
| `GET` | `/api/me` | Bearer | Name and display prefix of the calling key: `{ "name", "prefix" }` | `200` |
| `GET` | `/health` | — | Uptime and database reachability; `503` with `"status": "degraded"` if the DB is down; never cached | `200` |
| `GET` | `/docs` | — | Scalar API reference UI | `200` |
| `GET` | `/openapi.json` | — | OpenAPI 3.1 document | `200` |
| `POST` | `/api/links` | Bearer | Create a link: body `{ "url", "alias"? }` | `201` + `Location` |
| `GET` | `/api/links` | Bearer | List your links, newest first (`?limit=1–100&offset=0`) | `200` |
| `GET` | `/api/links/{code}` | Bearer | Get one of your links | `200` |
| `DELETE` | `/api/links/{code}` | Bearer | Delete one of your links and its clicks | `204` |
| `GET` | `/api/links/{code}/stats` | Bearer | Click stats: total, last 30 days, top referrers | `200` |
| `GET` / `HEAD` | `/{code}` | — | Redirect to the target. `GET` counts a click; `HEAD` does not | `302` |

Authenticated requests send `Authorization: Bearer tny_…`.

### Routing

Express matches requests in this order:

| Request | Result |
|---|---|
| `/health`, `/docs`, `/openapi.json` | Served by Express |
| `/api` and `/api/*` | Always the JSON API, never the UI. Unknown paths get a JSON `404 NOT_FOUND`, even from a browser |
| `GET /{code}` for an existing link | `302` redirect, whatever the client |
| `GET /{code}` that doesn't exist, from an API client (`Accept` prefers JSON: `application/json`, `*/*` or no `Accept`, as with curl) | JSON `404 NOT_FOUND` (`Link not found`) |
| `GET /{code}` that doesn't exist, from a browser (`Accept: text/html`) | The UI's HTML 404 page ("This short link doesn't exist") |
| A reserved word, case-insensitively (see Aliases below), or a path containing a dot (`/robots.txt`, `/favicon.ico`) | Never looked up as a code (no DB query, no redirect rate limit); goes to the UI |
| Everything else (pages, form posts, `/_app/*` assets) | The UI |

Without the UI mounted (`SERVE_UI=false`, or `web/build` missing), everything that would go to the UI gets a JSON `404`, and `GET /` returns the service info.

**Upgrading from the API-only version:** the service info moved from `GET /` to `GET /api` (with the UI mounted, `GET /` is the web app and redirects signed-out visitors to `/login`), and `login`, `logout`, `links`, `settings`, `account` and `_app` became reserved words. An existing link whose code matches one of them (in any case) stops redirecting; find them with:

```sh
docker exec teeny-url-postgres psql -U teeny -d teeny_url -c "SELECT code FROM links WHERE lower(code) IN ('login','logout','links','settings','account','_app');"
```

### Rules

| Topic | Behavior |
|---|---|
| Random codes | 7 characters of base62 (`0-9A-Za-z`) from a cryptographic RNG; retried on collision or when the code spells a reserved word |
| Aliases | Match `[A-Za-z0-9_-]{3,32}` and are case-sensitive (`Launch-Day` and `launch-day` are different links). They are unique across all keys. Reserved words, checked case-insensitively: `api`, `docs`, `health`, `openapi`, `admin`, `static`, and the UI paths `login`, `logout`, `links`, `settings`, `account`, `_app` |
| Target URLs | `http`/`https` only, at most 2048 characters, and not pointing back at the service: same host and port as `BASE_URL`, including other spellings such as `LOCALHOST`, a trailing dot, or (for a loopback `BASE_URL`) `127.x.x.x`, `[::1]` and `0.0.0.0` |
| Request body | `/api/*` only: JSON, at most 16 kB; larger bodies get `413`. Express does not parse bodies outside `/api`, so UI form posts reach SvelteKit untouched |
| Redirects | `302` + `Cache-Control: no-store`. A `GET` updates the click counter and inserts a click row in a single transaction. `HEAD` is not counted |
| Click data | Referrer: lowercased hostname only, with no path or query; `direct` when there is no `Referer`. User agent: truncated to 512 characters |
| Stats | `clicksByDay` covers the last 30 UTC days including today, oldest first, with zeros for days without clicks. `topReferrers` lists the top 5 by clicks |
| Ownership | A link is visible only to the key that created it. Other keys get `404` (not `403`). Revoking a key does not delete its links, which keep redirecting |
| Rate limit | Per client IP: 120 requests per minute on `/api/*`, and 300 per minute on redirects (`/{code}`), with IETF draft-8 `RateLimit` / `RateLimit-Policy` headers. Going over returns `429` + `Retry-After`. `/health`, `/docs`, `/openapi.json` and UI pages are not limited, but the UI's own API calls count toward the visitor's `/api/*` limit. `trust proxy` is `loopback` plus anything in `TRUST_PROXY`: `X-Forwarded-For` is honored only from those addresses, so put a reverse proxy that runs on another host into `TRUST_PROXY` |
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
| `pnpm key:revoke <id-or-prefix>` | Revokes a key by UUID or display prefix, effective immediately (the UI signs out on the next request). If a prefix matches more than one active key, revoke by id |

A key is `tny_` followed by 32 base64url characters (36 characters in total).

## Configuration

Copy `.env.example` to `.env`. The API validates its variables with zod at startup (`src/env.ts`) and exits with a readable message if one is invalid. `.env` is loaded with Node's `--env-file-if-exists`. Variables already set in the shell take precedence over `.env`. Under `pnpm dev`, the SvelteKit dev server reads the same root `.env` (`env.dir` in `web/vite.config.ts`) and validates `API_ORIGIN` in `web/src/env.ts`.

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
| `SERVE_UI` | `true` | API | `true`/`1`: mount the built UI (`web/build`). `false`/`0`: API only, and `GET /` returns the service info. `pnpm dev` (`dev:api`) always sets `false`. If `web/build` is missing, the server logs a warning and runs API-only |
| `TRUST_PROXY` | unset | API | Extra trusted reverse proxies, comma-separated: IPs, CIDRs or Express presets (`uniquelocal`, `linklocal`), e.g. `10.0.0.0/8`. Loopback is always trusted. Needed when a proxy on another host terminates TLS: it makes `req.protocol`/`req.ip` (and so the UI's origin check, `Secure` cookies and rate limits) use the proxy's `X-Forwarded-*` headers |
| `API_ORIGIN` | unset | web UI (server side) | Origin the UI's server code calls the API on (http or https). When unset: `http://127.0.0.1:$PORT` under `pnpm start` (set by `src/server.ts`), `http://localhost:3000` under `pnpm dev`. In dev it also sets the "API docs" link and the short-link host shown in the form |

When it serves the UI, the server pins adapter-node's `ADDRESS_HEADER=x-forwarded-for`, `PROTOCOL_HEADER=x-forwarded-proto` and `XFF_DEPTH=1` (other values are overridden with a warning — configure proxies with `TRUST_PROXY` instead). Don't set adapter-node's `HOST_HEADER` or `PORT_HEADER`: Express doesn't overwrite those, so clients could spoof them. Keep `API_ORIGIN` on loopback, or all UI users share one rate-limit bucket (the server warns).

If you change the Postgres port or credentials, update `DATABASE_URL` to match. Also update `tests/test-env.ts`, which hard-codes `postgres://teeny:teeny@localhost:5432/teeny_url_test`. If you change `PORT`, update `BASE_URL`, and set `API_ORIGIN=http://localhost:<PORT>` for `pnpm dev`.

## Project structure

```
.
├── .agentic-workflows/      # vendor-neutral agent workspace (agents/, gitignored worktrees/, future workflows)
├── AGENTS.md                # shared project conventions for AI coding agents
├── docker-compose.yml       # Postgres 17 (teeny-url-postgres)
├── docker/postgres/init.sql # creates teeny_url_test on first container start
├── drizzle/                 # generated SQL migrations (never hand-edited)
├── scripts/keys.ts          # API key CLI (create / list / revoke)
├── src/                     # the API (Express, no build step)
│   ├── app.ts               # createApp({ uiHandler? }): system routes → /api → redirects → UI or JSON 404 → errorHandler
│   ├── server.ts            # loads web/build/handler.js if present, listen + graceful shutdown
│   ├── env.ts               # zod-validated environment
│   ├── openapi.ts           # OpenAPI 3.1 document built from the zod schemas
│   ├── db/                  # Drizzle schema, pg pool, migrator
│   ├── lib/                 # errors, logger, short codes, URL + API key helpers
│   ├── middleware/          # auth, rate limit, CSP, UI headers, not-found, error handler
│   ├── routes/              # HTTP layer: parse input, shape output
│   ├── schemas/             # zod contracts: validation, types and OpenAPI in one place
│   └── services/            # business logic and queries
├── tests/                   # vitest + supertest; unit/ holds pure helper tests
└── web/                     # the web UI: SvelteKit 3 workspace package @teeny-url/web
    ├── vite.config.ts       # SvelteKit config as plugin options: adapter-node, CSP, env dir
    ├── src/
    │   ├── env.ts           # declared env vars (API_ORIGIN), validated at startup
    │   ├── hooks.server.ts  # resolves the session cookie with GET /api/me
    │   ├── lib/server/      # server-only: API client, session cookie, config
    │   ├── lib/components/  # CopyButton, Logo
    │   ├── lib/types.ts     # type-only re-exports of the API's zod contracts
    │   └── routes/          # / (shorten + recent links), /login, /logout, +error
    ├── static/              # robots.txt
    └── build/               # `pnpm build` output (git-ignored), mounted by src/server.ts
```

## Development

### Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Runs `dev:api` and `dev:web` in parallel. Open http://localhost:5173 |
| `pnpm dev:api` | The API with `node --watch` on `PORT` (:3000) and `SERVE_UI=false` |
| `pnpm dev:web` | The SvelteKit dev server (Vite, :5173, hot reload). Signing in needs the API running |
| `pnpm build` | Builds the UI into `web/build` (adapter-node). The API needs no build |
| `pnpm start` | One server on `PORT`, without watch: UI (if built), API, docs and redirects |
| `pnpm typecheck` | `tsc --noEmit` for the API (TypeScript 7), then `svelte-check` for the UI (TypeScript 6) |
| `pnpm lint` | `biome check .`: lint, format check and import order for `.ts`/`.json`, including `web/`. `.svelte` files are left to svelte-check |
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
- End-to-end tests (`tests/web.e2e.test.ts`) mount the real SvelteKit build and drive sign-in, shorten, sign-out, CSRF, cookies and CSP over HTTP. They are **skipped when `web/build` is missing** — run `pnpm build` first (always after changing `web/`). `pnpm typecheck` runs svelte-check over the pages.
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
| `web-engineer` | SvelteKit pages, form actions, server API client, components, CSS | `web/**` |
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
- Dockerfile (API + built UI), a compose service and a deployment guide (including `TRUST_PROXY` behind a reverse proxy)
- Per-key rate limits and quotas
- Bulk link creation
