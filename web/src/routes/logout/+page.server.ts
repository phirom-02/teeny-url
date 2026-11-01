import { redirect } from '@sveltejs/kit';
import { clearSession } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

// Signing out is a POST (a form in the header); a plain visit just goes home.
export const load: PageServerLoad = () => redirect(303, '/');

export const actions = {
  default: (event) => {
    clearSession(event);
    redirect(303, '/login');
  },
} satisfies Actions;
