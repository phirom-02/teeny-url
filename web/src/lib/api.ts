import type {
  CreateLinkBody,
  ErrorResponse,
  Link,
  LinkList,
  Me,
  ValidationIssue,
} from './types.ts';

export interface ApiError {
  code: string;
  message: string;
  details?: ValidationIssue[];
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError };

export class ApiStatusError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiStatusError';
    this.status = status;
    this.code = code;
  }
}

const TIMEOUT_MS = 10_000;

interface RequestInitOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
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

/**
 * Calls the same-origin Teeny-URL JSON API using the browser's `httpOnly` session cookie.
 * Never throws for HTTP or transport failures; returns a typed discriminated union.
 */
export const apiRequest = async <T>(
  path: `/api/${string}`,
  init: RequestInitOptions = {},
): Promise<ApiResult<T>> => {
  const headers = new Headers({ Accept: 'application/json' });
  let body: string | undefined;

  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  const method = init.method ?? (body === undefined ? 'GET' : 'POST');

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body,
      credentials: 'same-origin',
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
      error: {
        code,
        message,
        ...(Array.isArray(details) && { details: toIssues(details) }),
      },
    };
  }

  return {
    ok: false,
    status: response.status >= 500 ? response.status : 502,
    error: {
      code: 'BAD_RESPONSE',
      message: `The Teeny-URL API sent an unexpected response (HTTP ${response.status}).`,
    },
  };
};

export const getMe = (): Promise<ApiResult<Me>> => {
  return apiRequest<Me>('/api/me');
};

export const createSession = (key: string): Promise<ApiResult<Me>> => {
  return apiRequest<Me>('/api/session', { method: 'POST', body: { key } });
};

export const deleteSession = (): Promise<ApiResult<undefined>> => {
  return apiRequest<undefined>('/api/session', { method: 'DELETE' });
};

export const listLinks = (limit = 5, offset = 0): Promise<ApiResult<LinkList>> => {
  return apiRequest<LinkList>(`/api/links?limit=${limit}&offset=${offset}`);
};

export const createLink = (body: CreateLinkBody): Promise<ApiResult<Link>> => {
  return apiRequest<Link>('/api/links', { method: 'POST', body });
};
