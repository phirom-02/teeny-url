import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const apiOrigin = env.API_ORIGIN || 'http://localhost:3000';

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiOrigin, changeOrigin: false },
        '/docs': { target: apiOrigin, changeOrigin: false },
        '/openapi.json': { target: apiOrigin, changeOrigin: false },
        '/health': { target: apiOrigin, changeOrigin: false },
      },
    },
  };
});
