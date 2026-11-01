import type { ErrorResponse, ValidationIssue } from '#lib/types.ts';
import { API_ORIGIN } from '$app/env/private';

/** The API's error body, plus two codes of our own for transport problems. */
export interface ApiError {
  /** An API `ErrorCode`, or `API_UNREACHABLE` / `BAD_RESPONSE` (generated here). */
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

const TIMEOUT_MS = 10_000;

/**
 * Calls the Teeny-URL JSON API as `key`. Never throws for HTTP or network problems: a failed
 * connection or timeout becomes `{ ok: false, status: 503, error: { code: 'API_UNREACHABLE' } }`.
 *
 * Uses the global `fetch` rather than `event.fetch`, which would forward the browser's cookies
 * (including the session key) to a same-hostname API in dev.
 */
export async function api<T>(
  event: { getClientAddress: () => string },
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

  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, API_ORIGIN), {
      method: init.method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
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

function getClientAddress(event: { getClientAddress: () => string }): string | null {
  try {
    return event.getClientAddress();
  } catch {
    return null; // some adapters/configurations can't tell
  }
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
