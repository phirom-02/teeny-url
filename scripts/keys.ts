/**
 * API key management CLI.
 *
 *   pnpm key:create <name>
 *   pnpm key:list
 *   pnpm key:revoke <id-or-prefix>
 */
import { parseArgs, styleText } from 'node:util';
import { pool } from '../src/db/client.ts';
import type { ApiKeyRow } from '../src/db/schema.ts';
import { env } from '../src/env.ts';
import { AppError } from '../src/lib/errors.ts';
import { createApiKey, listApiKeys, revokeApiKey } from '../src/services/api-keys.service.ts';

const USAGE = `Manage Teeny-URL API keys.

Usage:
  pnpm key:create <name>            Create a key (the plaintext key is shown once)
  pnpm key:list                     List all keys
  pnpm key:revoke <id-or-prefix>    Revoke an active key

Or run directly: node --env-file=.env scripts/keys.ts <create|list|revoke> [arg]`;

type Style = Parameters<typeof styleText>[0];

/** Styled text for stdout / stderr (plain when the stream is not a TTY or NO_COLOR is set). */
const out = (style: Style, text: string) => styleText(style, text, { stream: process.stdout });
const err = (style: Style, text: string) => styleText(style, text, { stream: process.stderr });

function fail(message: string, { usage = false } = {}): number {
  console.error(err('red', `Error: ${message}`));
  if (usage) console.error(`\n${USAGE}`);
  return 1;
}

function formatDate(date: Date | null): string {
  return date ? `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC` : 'never';
}

function describe(key: ApiKeyRow): string {
  return `"${key.name}" (${key.prefix}, id ${key.id})`;
}

async function create(args: string[]): Promise<number> {
  const name = args.join(' ');
  if (!name.trim()) return fail('Missing key name.', { usage: true });

  const { key, apiKey } = await createApiKey(name);

  console.log(`
${out(['bold', 'green'], `API key created for "${apiKey.name}"`)}

  id      ${apiKey.id}
  prefix  ${apiKey.prefix}

  ${out('bold', key)}

${out(['bold', 'yellow'], 'Store this key now — it will not be shown again.')}

Try it:
  curl -H "Authorization: Bearer ${key}" ${env.BASE_URL}/api/links
`);
  return 0;
}

async function list(args: string[]): Promise<number> {
  if (args.length > 0) return fail('"list" takes no arguments.', { usage: true });

  const keys = await listApiKeys();
  if (keys.length === 0) {
    console.log(`No API keys yet. Create one with: ${out('bold', 'pnpm key:create <name>')}`);
    return 0;
  }

  const active = keys.filter((k) => !k.revokedAt).length;
  const noun = keys.length === 1 ? 'key' : 'keys';
  console.log(`${keys.length} API ${noun} (${active} active, ${keys.length - active} revoked)`);
  console.table(
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      created: formatDate(k.createdAt),
      'last used': formatDate(k.lastUsedAt),
      status: k.revokedAt ? 'revoked' : 'active',
    })),
  );
  return 0;
}

async function revoke(args: string[]): Promise<number> {
  const [target, ...extra] = args;
  if (!target || extra.length > 0) {
    return fail('Expected exactly one <id-or-prefix>.', { usage: true });
  }

  const revoked = await revokeApiKey(target);
  if (revoked) {
    console.log(
      `${out('green', 'Revoked')} ${describe(revoked)} at ${formatDate(revoked.revokedAt)}.`,
    );
    return 0;
  }

  // Nothing active matched — say whether it was already revoked or never existed.
  const input = target.trim();
  const previous = (await listApiKeys()).find(
    (k) => k.revokedAt && (k.id === input.toLowerCase() || k.prefix === input),
  );
  if (previous) {
    return fail(
      `Key ${describe(previous)} was already revoked at ${formatDate(previous.revokedAt)}.`,
    );
  }
  return fail(`No active API key matches "${input}". Run "pnpm key:list" to see your keys.`);
}

/** Error code of an error or anything in its `cause` chain (Drizzle wraps driver errors). */
function errorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    if ('code' in current && typeof current.code === 'string') return current.code;
    current = current.cause;
  }
  return undefined;
}

function reportError(error: unknown): number {
  if (error instanceof AppError) {
    console.error(err('red', `Error: ${error.message}`));
    if (Array.isArray(error.details)) {
      for (const d of error.details as Array<{ path?: string; message?: string }>) {
        console.error(err('red', `  - ${d.path ? `${d.path}: ` : ''}${d.message ?? ''}`));
      }
    }
    return 1;
  }
  const code = errorCode(error);
  if (code === 'ECONNREFUSED') {
    const { hostname, port } = new URL(env.DATABASE_URL);
    return fail(
      `Could not connect to Postgres at ${hostname}:${port || 5432}. Is it running? Try: pnpm docker:up`,
    );
  }
  if (code === '42P01') {
    return fail('The api_keys table does not exist. Apply migrations first: pnpm db:migrate');
  }
  if (code?.startsWith('ERR_PARSE_ARGS') && error instanceof Error) {
    return fail(error.message, { usage: true });
  }
  console.error(error);
  return 1;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h' } },
  });
  const [command, ...args] = positionals;

  if (values.help || command === 'help') {
    console.log(USAGE);
    return 0;
  }

  switch (command) {
    case 'create':
      return create(args);
    case 'list':
      return list(args);
    case 'revoke':
      return revoke(args);
    case undefined:
      return fail('Missing command.', { usage: true });
    default:
      return fail(`Unknown command "${command}".`, { usage: true });
  }
}

let exitCode = 1;
try {
  exitCode = await main(process.argv.slice(2));
} catch (error) {
  exitCode = reportError(error);
} finally {
  await pool.end();
}
process.exitCode = exitCode;
