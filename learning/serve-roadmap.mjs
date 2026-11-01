#!/usr/bin/env node
/**
 * Serves the interactive roadmap at http://127.0.0.1:8765 (set ROADMAP_PORT to change the port).
 * Rebuilds learning/roadmap.html from ROADMAP.md first, and re-reads the file on every request,
 * so a rebuild shows up on refresh without restarting.
 *
 *   pnpm roadmap
 *   node learning/serve-roadmap.mjs
 *
 * Listens on localhost only. No dependencies.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const dir = import.meta.dirname;
const page = path.join(dir, 'roadmap.html');
const port = Number(process.env.ROADMAP_PORT ?? 8765);

execFileSync(process.execPath, [path.join(dir, 'build-roadmap-html.mjs')], { stdio: 'inherit' });

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname !== '/' && pathname !== '/roadmap.html') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  res
    .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    .end(readFileSync(page));
});

server.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the other server, or run with ROADMAP_PORT=<port>.`
      : err,
  );
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Roadmap: http://127.0.0.1:${port}/   (Ctrl+C to stop)`);
});

process.once('SIGINT', () => server.close(() => process.exit(0)));
