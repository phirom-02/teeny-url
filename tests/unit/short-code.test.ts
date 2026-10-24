import { describe, expect, it } from 'vitest';
import { generateShortCode, SHORT_CODE_ALPHABET } from '../../src/lib/short-code.ts';

describe('SHORT_CODE_ALPHABET', () => {
  it('is the 62 base62 characters', () => {
    expect(SHORT_CODE_ALPHABET).toHaveLength(62);
    expect(new Set(SHORT_CODE_ALPHABET).size).toBe(62);
    expect(SHORT_CODE_ALPHABET).toMatch(/^[0-9A-Za-z]+$/);
  });
});

describe('generateShortCode', () => {
  it('returns a 7-character base62 code by default', () => {
    expect(generateShortCode()).toMatch(/^[0-9A-Za-z]{7}$/);
  });

  it.each([1, 12, 32])('honours a custom length of %i', (length) => {
    const code = generateShortCode(length);

    expect(code).toHaveLength(length);
    expect(code).toMatch(/^[0-9A-Za-z]+$/);
  });

  it('produces unique codes across many calls', () => {
    const codes = Array.from({ length: 2000 }, () => generateShortCode());

    expect(codes.every((c) => /^[0-9A-Za-z]{7}$/.test(c))).toBe(true);
    // 62^7 ≈ 3.5e12 possibilities: a collision in 2000 draws is ~1e-6 likely.
    expect(new Set(codes).size).toBeGreaterThanOrEqual(1999);
  });

  it('draws from the whole alphabet', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateShortCode()).join(''));

    // 14 000 characters drawn uniformly from 62: missing any one is astronomically unlikely.
    expect(seen.size).toBe(62);
  });
});
