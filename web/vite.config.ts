import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
      // `pnpm build` → build/handler.js, which the Express server mounts (src/server.ts).
      adapter: adapter(),
      // Share the repo-root `.env` with the API (API_ORIGIN lives there). Variables already set
      // in the shell take precedence. Only names declared in src/env.ts are exposed to the app.
      env: { dir: fileURLToPath(new URL('..', import.meta.url)) },
      // Nonces for dynamically rendered pages, hashes for prerendered ones. `style-src 'self'` is
      // enough for the built CSS files; in dev SvelteKit adds 'unsafe-inline' itself so Vite can
      // inject <style> tags. So: never use inline `style` attributes — production blocks them.
      csp: {
        mode: 'auto',
        directives: {
          'default-src': ['self'],
          'script-src': ['self'],
          'style-src': ['self'],
          // SvelteKit's route announcer (a11y live region) carries one fixed inline style
          // attribute; allow exactly that one by hash instead of 'unsafe-inline'. If a SvelteKit
          // upgrade changes it, the browser console reports the new hash to put here.
          'style-src-attr': [
            'unsafe-hashes',
            'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=',
          ],
          'img-src': ['self', 'data:'],
          'font-src': ['self'],
          'connect-src': ['self'],
          'object-src': ['none'],
          'base-uri': ['self'],
          'form-action': ['self'],
          'frame-ancestors': ['none'],
        },
      },
    }),
  ],
});
