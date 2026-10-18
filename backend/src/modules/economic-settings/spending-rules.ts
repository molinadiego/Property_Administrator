import { MONEY_PATTERN } from '../../common/dto/money';

/**
 * Pure economic rules (spec etapa-4.md §4.6 computations, §8.4–§8.6). No
 * Prisma, no Nest: unit-testable in isolation (pattern:
 * modules/orders/job-rules.ts). Money is handled as integer cents of USD
 * (decision 2, §1.2) — never floats (§3).
 */

export type EmergencyPolicyValue =
  | 'prior_authorization'
  | 'resolve_without_authorization'
  | 'emergency_amount';

/** Decimal string (or number) → integer cents. Throws on invalid input. */
export function toCents(value: string | number): number {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  if (!MONEY_PATTERN.test(text)) {
    throw new RangeError(`Invalid money amount: ${text}`);
  }
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

/** Nullable variant: null/undefined stay null; invalid strings throw. */
export function nullableToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  return toCents(value);
}

/** Cents → canonical decimal string with 2 decimals ("1234.56"). */
export function fromCents(cents: number | null): string | null {
  if (cents === null) return null;
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Effective limit of an order (§8.4): its own limit if set, otherwise the
 * company's general policy; null means «sin límite económico».
 */
export function computeEffectiveLimitCents(
  orderLimitCents: number | null,
  companyDefaultCents: number | null,
): number | null {
  return orderLimitCents ?? companyDefaultCents;
}

/**
 * Authorized ceiling (§8.4): the effective limit plus every additional
 * amount authorized by `exceed_spending_limit` constancias. Stays null when
 * there is no limit (§8.4: «sin límite» never becomes a ceiling).
 */
export function computeAuthorizedCeilingCents(
  effectiveLimitCents: number | null,
  authorizations: ReadonlyArray<{ type: string; amountCapCents: number | null }>,
): number | null {
  if (effectiveLimitCents === null) return null;
  const extra = authorizations
    .filter((authorization) => authorization.type === 'exceed_spending_limit')
    .reduce((sum, authorization) => sum + (authorization.amountCapCents ?? 0), 0);
  return effectiveLimitCents + extra;
}

/**
 * Over-limit flag (§8.5): informational only. The real spend is always
 * kept; exceeding never blocks registration.
 */
export function exceedsLimit(ceilingCents: number | null, submittedTotalCents: number): boolean {
  return ceilingCents !== null && submittedTotalCents > ceilingCents;
}

/** Commercial margin cap (§8.5): up to 20 %, enabled explicitly. */
export const MARGIN_PERCENT_MAX = 20;

/** Margin percent: 0–20 with up to 2 decimals (percent as cents: 20.50 → 2050). */
export function isValidMarginPercent(value: string | number): boolean {
  const text = typeof value === 'number' ? value.toFixed(2) : value;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return false;
  return toCents(text) <= MARGIN_PERCENT_MAX * 100;
}

export interface EmergencyPolicySource {
  policy: EmergencyPolicyValue;
  extraAmountCents: number | null;
  /** Whose policy governs (§8.6): the linked relation or the company. */
  source: 'relation' | 'company';
}

/**
 * Effective emergency policy of an order (§8.6, decision 4): the linked
 * commercial relation's policy when it defines one, otherwise the company's
 * general policy.
 */
export function resolveEmergencyPolicy(
  relation:
    | { emergencyPolicy: EmergencyPolicyValue | null; emergencyExtraAmountCents: number | null }
    | null,
  company: { emergencyPolicy: EmergencyPolicyValue; emergencyExtraAmountCents: number | null },
): EmergencyPolicySource {
  if (relation && relation.emergencyPolicy !== null) {
    return {
      policy: relation.emergencyPolicy,
      extraAmountCents: relation.emergencyExtraAmountCents,
      source: 'relation',
    };
  }
  return {
    policy: company.emergencyPolicy,
    extraAmountCents: company.emergencyExtraAmountCents,
    source: 'company',
  };
}

/** Pre-authorized emergency ceiling: only the `emergency_amount` policy (§8.6). */
export function emergencyCeilingCents(policy: EmergencyPolicySource): number | null {
  return policy.policy === 'emergency_amount' ? policy.extraAmountCents : null;
}

/** Emergency overage signal (§8.6, matrix #44): informational, never blocking. */
export function emergencyExceeds(ceilingCents: number | null, emergencyTotalCents: number): boolean {
  return ceilingCents !== null && emergencyTotalCents > ceilingCents;
}

/** The `emergency_amount` policy only makes sense with an amount (§11). */
export function validateEmergencyAmount(
  policy: EmergencyPolicyValue,
  extraAmountCents: number | null,
): boolean {
  if (policy !== 'emergency_amount') return true;
  return extraAmountCents !== null && extraAmountCents > 0;
}
