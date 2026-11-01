import type { RequestEvent } from '@sveltejs/kit';
import type { ErrorResponse, ValidationIssue } from '#lib/types.ts';
import { API_ORIGIN } from '$app/env/private';

/** The API's error body, plus two codes of our own for transport problems. */
export interface ApiError {
  /** An API error code, or `API_UNREACHABLE` / `BAD_RESPONSE` (generated here). */
  code: string;
  message: string;
  details?: ValidationIssue[];
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError };

export interface ApiInit {
  method?: 'GET' | 'POST' | 'DELETE';
  /** Sent as JSON. */
  body?: unknown;
}

/** The parts of the SvelteKit request event `api()` reads. */
export type ApiEvent = Pick<RequestEvent, 'getClientAddress' | 'platform' | 'request'>;

const TIMEOUT_MS = 10_000;

/** Same rule the API applies to an incoming `X-Request-Id` (src/lib/logger.ts). */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Calls the Teeny-URL JSON API as `key`. Never throws for HTTP or network problems: a failed
 * connection or timeout is logged and becomes
 * `{ ok: false, status: 503, error: { code: 'API_UNREACHABLE' } }`.
 *
 * Uses the global `fetch` rather than `event.fetch`, which would forward the browser's cookies
 * (including the session key) to a same-hostname API in dev.
 */
export async function api<T>(
  event: ApiEvent,
  key: string,
  path: `/api/${string}`,
  init: ApiInit = {},
): Promise<ApiResult<T>> {
  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${key}`,
  });
  const clientAddress = getClientAddress(event);
  if (clientAddress) headers.set('X-Forwarded-For', clientAddress);
  const id = requestId(event);
  if (id) headers.set('X-Request-Id', id);

  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  const url = new URL(path, API_ORIGIN);
  const method = init.method ?? (body === undefined ? 'GET' : 'POST');
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Method, path and error kind only: never the headers (they carry the key).
    console.warn(`[web] API unreachable: ${method} ${url.pathname} ${describeFetchError(err)}`);
    return {
      ok: false,
      status: 503,
      error: {
        code: 'API_UNREACHABLE',
        message: 'The Teeny-URL API is unreachable right now. Please try again in a moment.',
      },
    };
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (response.ok && (payload !== undefined || response.status === 204)) {
    return { ok: true, status: response.status, data: payload as T };
  }

  if (response.status >= 400 && isErrorResponse(payload)) {
    const { code, message, details } = payload.error;
    return {
      ok: false,
      status: response.status,
      error: { code, message, ...(Array.isArray(details) && { details: toIssues(details) }) },
    };
  }

  // Not the API talking (a proxy page, a redirect, an empty body…).
  return {
    ok: false,
    status: response.status >= 500 ? response.status : 502,
    error: {
      code: 'BAD_RESPONSE',
      message: `The Teeny-URL API sent an unexpected response (HTTP ${response.status}).`,
    },
  };
}

let warnedNoClientAddress = false;

/**
 * The browser's address, forwarded so the API rate-limits per user rather than per UI server.
 * `null` when the adapter can't tell (warned about once per process).
 */
function getClientAddress(event: ApiEvent): string | null {
  try {
    return event.getClientAddress();
  } catch (err) {
    if (!warnedNoClientAddress) {
      warnedNoClientAddress = true;
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[web] Client address unavailable; calling the API without X-Forwarded-For, so all ` +
          `users share one rate limit: ${reason}`,
      );
    }
    return null;
  }
}

/**
 * The id of the request being handled, so the API logs this call under the same id as the UI
 * request. When Express serves the UI, pino-http has set `req.id` on the Node request, which
 * adapter-node exposes as `event.platform.req`; otherwise (`vite dev`, standalone `node build`)
 * an incoming `X-Request-Id` header. Omitted unless it looks like a sane token.
 */
function requestId(event: ApiEvent): string | null {
  const req: unknown = event.platform?.req;
  const fromExpress = typeof req === 'object' && req !== null && 'id' in req ? req.id : undefined;
  const id = fromExpress ?? event.request.headers.get('x-request-id');
  return typeof id === 'string' && REQUEST_ID_PATTERN.test(id) ? id : null;
}

/** `error=<name>` plus `cause=<code>` when there is one, e.g. `error=TypeError cause=ECONNREFUSED`. */
function describeFetchError(err: unknown): string {
  if (typeof err !== 'object' || err === null) return `error=${typeof err}`;
  const name = 'name' in err && typeof err.name === 'string' ? err.name : 'unknown';
  const cause = 'cause' in err ? err.cause : undefined;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
      ? cause.code
      : undefined;
  return code ? `error=${name} cause=${code}` : `error=${name}`;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

function toIssues(details: unknown[]): ValidationIssue[] {
  return details.flatMap((issue) =>
    typeof issue === 'object' &&
    issue !== null &&
    'path' in issue &&
    typeof issue.path === 'string' &&
    'message' in issue &&
    typeof issue.message === 'string'
      ? [{ path: issue.path, message: issue.message }]
      : [],
  );
}
