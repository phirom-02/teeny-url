import { error, fail, redirect } from '@sveltejs/kit';
import { api } from '#lib/server/api.ts';
import { isPlausibleKey, setSession } from '#lib/server/session.ts';
import type { Me } from '#lib/types.ts';
import type { Actions, PageServerLoad } from './$types';

const INVALID_KEY = 'That key is invalid or has been revoked.';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.apiError) error(locals.apiError.status, locals.apiError.message);
  if (locals.user) redirect(303, '/');
};

export const actions = {
  // The key is never echoed back to the page, not even on failure. `keyError` is a problem with
  // the key itself (shown on the field); `message` is anything else, such as the API being down
  // or rate limiting (shown as a notice, the key may well be fine).
  default: async (event) => {
    const value = (await event.request.formData()).get('key');
    const key = typeof value === 'string' ? value.trim() : '';

    if (!key) return fail(400, { keyError: 'Paste your API key to sign in.' });
    if (!isPlausibleKey(key)) return fail(400, { keyError: INVALID_KEY });

    const me = await api<Me>(event, key, '/api/me');
    if (me.ok) {
      setSession(event, key);
      redirect(303, '/');
    }
    if (me.status === 401) return fail(400, { keyError: INVALID_KEY });
    return fail(me.status, { message: me.error.message });
  },
} satisfies Actions;
