/**
 * Money helpers (spec F0 §4 / frontend AGENTS.md: "Dinero sin Float").
 *
 * The API transports amounts as decimal strings with up to 2 decimals and at
 * most 10 integer digits (range [0, 9999999999.99], backend spec etapa-4 §3).
 * All arithmetic below is done on integers (cents): no `parseFloat`, no
 * multiplication of decimals — so `0.1 + 0.2` style drift can never happen.
 */

/** Same shape the backend validates (backend `common/dto/money.ts`). */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/** "1234.5" → 123450 (cents). Returns null when the value is not valid money. */
export function parseMoneyToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const [integerPart, fractionPart = ''] = trimmed.split('.');
  const dollars = Number.parseInt(integerPart, 10);
  const cents = Number.parseInt(fractionPart.padEnd(2, '0'), 10);
  return dollars * 100 + cents;
}

/** Groups the integer dollars with US-style separators: 9999999999 → "9,999,999,999". */
function groupInteger(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Cents → "USD 1,234.56". Integer-only math: the remainder splits dollars and
 * cents exactly, then the parts are concatenated (never divided as floats).
 */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  const remainder = absolute % 100;
  // `absolute - remainder` is a multiple of 100 → /100 is an exact integer.
  const dollars = (absolute - remainder) / 100;
  const sign = negative ? '-' : '';
  return `${sign}USD ${groupInteger(dollars)}.${String(remainder).padStart(2, '0')}`;
}

/** Decimal string from the API → "USD 1,234.56" (null when not valid money). */
export function formatMoney(value: string): string | null {
  const cents = parseMoneyToCents(value);
  return cents === null ? null : formatCents(cents);
}
