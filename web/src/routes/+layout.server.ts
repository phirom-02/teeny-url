import { docsUrl } from '#lib/server/config.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
  user: locals.user,
  docsUrl: docsUrl(),
});
