import { describe, expect, it } from 'vitest';

import { formatCents, formatMoney, parseMoneyToCents } from './money';

describe('parseMoneyToCents', () => {
  it('parses decimal strings from the API into integer cents', () => {
    expect(parseMoneyToCents('0')).toBe(0);
    expect(parseMoneyToCents('1')).toBe(100);
    expect(parseMoneyToCents('19.99')).toBe(1999);
    expect(parseMoneyToCents('1234.5')).toBe(123450);
    expect(parseMoneyToCents('9999999999.99')).toBe(999999999999);
  });

  it('trims surrounding whitespace', () => {
    expect(parseMoneyToCents('  42.10  ')).toBe(4210);
  });

  it('rejects values that are not valid money', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('1.234')).toBeNull(); // 3 decimals
    expect(parseMoneyToCents('-5')).toBeNull(); // no negatives in the contract
    expect(parseMoneyToCents('1e3')).toBeNull(); // no scientific notation
    expect(parseMoneyToCents('12345678901')).toBeNull(); // > 10 integer digits
    expect(parseMoneyToCents('0x10')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats cents as "USD 1,234.56" with grouping', () => {
    expect(formatCents(0)).toBe('USD 0.00');
    expect(formatCents(5)).toBe('USD 0.05');
    expect(formatCents(1999)).toBe('USD 19.99');
    expect(formatCents(123456)).toBe('USD 1,234.56');
    expect(formatCents(999999999999)).toBe('USD 9,999,999,999.99');
  });

  it('formats negative cents (e.g. corrections)', () => {
    expect(formatCents(-123456)).toBe('-USD 1,234.56');
  });
});

describe('formatMoney', () => {
  it('never produces floating point artifacts (spec F0 §4)', () => {
    const tenth = parseMoneyToCents('0.1');
    const twentieth = parseMoneyToCents('0.2');
    expect(tenth).not.toBeNull();
    expect(twentieth).not.toBeNull();
    // 0.1 + 0.2 as floats would be 0.30000000000000004.
    expect(formatCents((tenth ?? 0) + (twentieth ?? 0))).toBe('USD 0.30');
  });

  it('round-trips API decimal strings', () => {
    expect(formatMoney('1234.5')).toBe('USD 1,234.50');
    expect(formatMoney('19.99')).toBe('USD 19.99');
  });

  it('returns null for invalid values instead of misleading output', () => {
    expect(formatMoney('not-money')).toBeNull();
  });
});
