import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { API_KEY_PREFIX, generateApiKey, hashApiKey } from '../../src/lib/api-key.ts';

describe('generateApiKey', () => {
  it('returns a tny_ key of 36 characters (tny_ + 32 base64url)', () => {
    const { key } = generateApiKey();

    expect(API_KEY_PREFIX).toBe('tny_');
    expect(key.startsWith('tny_')).toBe(true);
    expect(key).toHaveLength(36);
    expect(key).toMatch(/^tny_[A-Za-z0-9_-]{32}$/);
  });

  it('exposes the first 12 characters as the display prefix', () => {
    const { key, prefix } = generateApiKey();

    expect(prefix).toBe(key.slice(0, 12));
    expect(prefix).toHaveLength(12);
  });

  it('returns the SHA-256 hex hash of the key', () => {
    const { key, hash } = generateApiKey();

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiKey(key));
    expect(hash).toBe(createHash('sha256').update(key).digest('hex'));
  });

  it('generates a different key every time', () => {
    const keys = Array.from({ length: 100 }, () => generateApiKey().key);

    expect(new Set(keys).size).toBe(100);
  });
});

describe('hashApiKey', () => {
  it('is deterministic', () => {
    expect(hashApiKey('tny_example')).toBe(hashApiKey('tny_example'));
  });

  it('matches SHA-256 hex', () => {
    expect(hashApiKey('tny_example')).toBe(
      createHash('sha256').update('tny_example').digest('hex'),
    );
  });

  it('differs for different keys', () => {
    expect(hashApiKey('tny_a')).not.toBe(hashApiKey('tny_b'));
  });
});
