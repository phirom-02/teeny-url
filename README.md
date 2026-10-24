# Teeny-URL

A small URL shortener API. You create short links with an API key, the service redirects visitors and counts their clicks.

**Stack:** Express 5 · TypeScript run directly by Node 24 (type stripping, no build step) · PostgreSQL 17 in Docker · Drizzle ORM · zod 4 contracts → OpenAPI 3.1 → Scalar docs · pino · Biome · vitest + supertest · pnpm

## Features

- **Short links:** random 7-character base62 codes, or a custom alias of your choice.
- **Redirects:** `302` with `Cache-Control: no-store`, so every visit reaches the server and is counted. `HEAD` requests are not counted.
- **Click stats:** total clicks, daily counts for the last 30 days (UTC), and the top 5 referrers. Only the referrer's hostname is stored.
- **API keys:** keys start with `tny_` and only their SHA-256 hash is stored. Each link is private to the key that created it; other keys get `404`.
- **Contracts first:** zod schemas drive request validation, the TypeScript types, the OpenAPI 3.1 document and the interactive docs at `/docs`.
- **Hardened defaults:** a single error envelope, per-IP rate limits, helmet security headers, open CORS, an `X-Request-Id` on every response, and structured pino logs that never contain `Authorization` headers.
- **No build step:** `node src/server.ts` runs the TypeScript as-is.
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
pnpm dev                    # http://localhost:3000 · docs at http://localhost:3000/docs
```

On its first start, the container also creates `teeny_url_test`, the database that `pnpm test` uses. The examples below read your key from an environment variable:

```sh
export TEENY_KEY='tny_…'    # replace with the key printed by key:create
```

## Usage

All examples assume `pnpm dev` is running on `http://localhost:3000`. The responses below come from a real run, pretty-printed and with headers trimmed.

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

When a request sends a `Referer` header, only its hostname is recorded. Without one, the click is counted as `direct`. A `HEAD` request (`curl -I`) returns the same redirect without counting a click.

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
| `GET` | `/` | — | Service name, version and docs path | `200` |
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

### Rules

| Topic | Behavior |
|---|---|
| Random codes | 7 characters of base62 (`0-9A-Za-z`) from a cryptographic RNG; retried on collision |
| Aliases | Match `[A-Za-z0-9_-]{3,32}` and are case-sensitive (`Launch-Day` and `launch-day` are different links). They are unique across all keys. Reserved words, checked case-insensitively: `api`, `docs`, `health`, `openapi`, `admin`, `static` |
| Target URLs | `http`/`https` only, at most 2048 characters, and not pointing back at the service: same host and port as `BASE_URL`, including other spellings such as `LOCALHOST`, a trailing dot, or (for a loopback `BASE_URL`) `127.x.x.x`, `[::1]` and `0.0.0.0` |
| Request body | JSON, at most 16 kB; larger bodies get `413` |
| Redirects | `302` + `Cache-Control: no-store`. A `GET` updates the click counter and inserts a click row in a single transaction. `HEAD` is not counted |
| Click data | Referrer: lowercased hostname only, with no path or query; `direct` when there is no `Referer`. User agent: truncated to 512 characters |
| Stats | `clicksByDay` covers the last 30 UTC days including today, oldest first, with zeros for days without clicks. `topReferrers` lists the top 5 by clicks |
| Ownership | A link is visible only to the key that created it. Other keys get `404` (not `403`). Revoking a key does not delete its links, which keep redirecting |
| Rate limit | Per client IP: 120 requests per minute on `/api/*`, and 300 per minute on redirects (`/{code}`), with IETF draft-8 `RateLimit` / `RateLimit-Policy` headers. Going over returns `429` + `Retry-After`. `/health`, `/docs` and `/openapi.json` are not limited. `trust proxy` is not enabled, so behind a reverse proxy all clients share one bucket |
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
| `NOT_FOUND` | 404 | Unknown code, a link owned by another key, or an unknown route |
| `ALIAS_TAKEN` | 409 | Alias already in use by any key |
| `PAYLOAD_TOO_LARGE` | 413 | Request body over 16 kB |
| `RATE_LIMITED` | 429 | Over 120 requests per minute on `/api/*`, or 300 on redirects. `Retry-After` gives the seconds to wait |
| `INTERNAL_ERROR` | 500 | Unexpected failure. The server logs it and returns a generic message |

## API keys

Manage keys on the server with the CLI. Each command reads `DATABASE_URL` from `.env`.

| Command | What it does |
|---|---|
| `pnpm key:create <name>` | Creates a key and prints its id, display prefix and full `tny_…` key. The full key is shown **once**; only its SHA-256 hash and a 12-character prefix (e.g. `tny_AbCd1234`) are stored. Names are 1–64 characters |
| `pnpm key:list` | Lists all keys, active and revoked, with prefix, creation time, last use and status |
| `pnpm key:revoke <id-or-prefix>` | Revokes a key by UUID or display prefix, effective immediately. If a prefix matches more than one active key, revoke by id |

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

If you change the Postgres port or credentials, update `DATABASE_URL` to match. Also update `tests/test-env.ts`, which hard-codes `postgres://teeny:teeny@localhost:5432/teeny_url_test`.

## Project structure

```
.
├── .claude/agents/          # Claude Code sub-agent definitions
├── docker-compose.yml       # Postgres 17 (teeny-url-postgres)
├── docker/postgres/init.sql # creates teeny_url_test on first container start
├── drizzle/                 # generated SQL migrations (never hand-edited)
├── scripts/keys.ts          # API key CLI (create / list / revoke)
├── src/
│   ├── app.ts               # createApp(): middleware → routers → notFound → errorHandler
│   ├── server.ts            # listen + graceful shutdown
│   ├── env.ts               # zod-validated environment
│   ├── openapi.ts           # OpenAPI 3.1 document built from the zod schemas
│   ├── db/                  # Drizzle schema, pg pool, migrator
│   ├── lib/                 # errors, logger, short codes, URL + API key helpers
│   ├── middleware/          # auth, rate limit, not-found, error handler
│   ├── routes/              # HTTP layer: parse input, shape output
│   ├── schemas/             # zod contracts: validation, types and OpenAPI in one place
│   └── services/            # business logic and queries
└── tests/                   # vitest + supertest; unit/ holds pure helper tests
```

## Development

### Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start the API with `node --watch` (restarts on change) |
| `pnpm start` | Start the API without watch |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | `biome check .` (lint, format check and import order) |
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
- `NODE_ENV=test` silences logs and disables the rate limit.
- If `teeny_url_test` is missing because your Docker volume predates `init.sql`, create it with `docker exec teeny-url-postgres createdb -U teeny teeny_url_test`.

### Database migrations

1. Edit `src/db/schema.ts`.
2. Run `pnpm db:generate --name add_link_expiry` and review the new SQL file in `drizzle/`.
3. Run `pnpm db:migrate` to apply it to the dev database.
4. Run `pnpm test`, which migrates the test database automatically.

Don't edit files in `drizzle/` by hand. If an unreleased migration is wrong, delete it and generate it again. Use `pnpm db:studio` to browse the data.

### Working with Claude Code sub-agents

`.claude/agents/` defines five sub-agents with disjoint file ownership, so they can work in parallel without conflicts. `CLAUDE.md` holds the shared conventions they all follow.

| Agent | Use for | Owns |
|---|---|---|
| `db-architect` | Schema changes, migrations, indexes, non-trivial SQL | `src/db/**`, `drizzle/**` |
| `api-engineer` | Routes, middleware, services, zod contracts, OpenAPI, key CLI | `src/**` except `src/db`, plus `scripts/**`. It edits only the files its task assigns |
| `test-engineer` | Writing and fixing tests, reproducing bugs as failing tests | `tests/**`, `vitest.config.ts`. It never edits `src/` and reports app bugs instead |
| `code-reviewer` | Pre-commit review of correctness, security, contracts and conventions; runs all checks | Nothing (read-only) |
| `docs-writer` | README, CLAUDE.md, `.env.example`, OpenAPI descriptions | `*.md`, `.env.example`, `description`/`example` text in zod `.meta()` |

**Delegation pattern for a feature:**

1. `db-architect`, if the schema changes.
2. `api-engineer` and `test-engineer` **in parallel**. Their files don't overlap, and tests are written against the zod contracts.
3. The main agent integrates the work until `pnpm typecheck && pnpm lint && pnpm test` pass.
4. `code-reviewer` and `docs-writer` **in parallel**.
5. Apply the fixes, then commit.

Run agents in parallel only when their file ownership doesn't overlap. To split one area across several `api-engineer` instances, give each one an explicit list of files.

## Roadmap

- Web UI for creating links and browsing stats
- Link expiration (`expiresAt`), with expired links no longer redirecting
- A QR code for each short link
- Redis cache for hot redirects, with click writes moved off the request path
- Dockerfile for the API, a compose service and a deployment guide (including `trust proxy`)
- Per-key rate limits and quotas
- Bulk link creation
