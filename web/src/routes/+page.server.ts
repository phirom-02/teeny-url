import { fail, redirect } from '@sveltejs/kit';
import { api } from '#lib/server/api.ts';
import { shortLinkHost } from '#lib/server/config.ts';
import { clearSession, requireApiKey } from '#lib/server/session.ts';
import type { CreateLinkBody, Link, LinkList, ValidationIssue } from '#lib/types.ts';
import type { Actions, PageServerLoad } from './$types';

const RECENT_LIMIT = 5;

type Field = 'url' | 'alias';
type FieldErrors = Partial<Record<Field, string>>;

/** Every failed submission has the same shape, so the page can re-fill and annotate the form. */
function failure(
  status: number,
  values: Record<Field, string>,
  errors: FieldErrors = {},
  message: string | null = null,
) {
  return fail(status, { values, errors, message });
}

function text(form: FormData, name: Field): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Maps `details[].path` from a VALIDATION_ERROR onto the form's fields. */
function toFieldErrors(issues: ValidationIssue[] = []): { errors: FieldErrors; other: string[] } {
  const errors: FieldErrors = {};
  const other: string[] = [];
  for (const { path, message } of issues) {
    if (path === 'url' || path === 'alias') errors[path] ??= message;
    else other.push(message);
  }
  return { errors, other };
}

export const load: PageServerLoad = async (event) => {
  const key = requireApiKey(event.locals);

  const result = await api<LinkList>(event, key, `/api/links?limit=${RECENT_LIMIT}`);
  if (!result.ok && result.status === 401) {
    clearSession(event);
    redirect(303, '/login');
  }

  return {
    shortHost: shortLinkHost(event.url),
    recent: result.ok
      ? { links: result.data.data, total: result.data.pagination.total, error: null }
      : { links: [] as Link[], total: 0, error: result.error.message },
  };
};

export const actions = {
  default: async (event) => {
    const { locals } = event;
    const form = await event.request.formData();
    const values = { url: text(form, 'url'), alias: text(form, 'alias') };

    if (locals.apiError)
      return failure(locals.apiError.status, values, {}, locals.apiError.message);
    if (!locals.apiKey) redirect(303, '/login');
    if (!values.url) return failure(400, values, { url: 'Enter the URL you want to shorten.' });

    const body: CreateLinkBody = values.alias
      ? { url: values.url, alias: values.alias }
      : { url: values.url };
    const result = await api<Link>(event, locals.apiKey, '/api/links', { method: 'POST', body });

    if (result.ok) return { created: result.data };

    if (result.status === 401) {
      clearSession(event); // the key was revoked since the page loaded
      redirect(303, '/login');
    }
    if (result.status === 409) {
      return failure(409, values, { alias: result.error.message });
    }
    if (result.status === 400) {
      const { errors, other } = toFieldErrors(result.error.details);
      const message = other.join(' ') || (errors.url || errors.alias ? null : result.error.message);
      return failure(400, values, errors, message);
    }
    return failure(result.status, values, {}, result.error.message);
  },
} satisfies Actions;
