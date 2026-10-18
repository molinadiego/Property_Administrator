/**
 * Pure rules for authorization requests and constancias (spec etapa-4.md
 * §4.4–§4.5, §8.4, §8.7, §9, §18.1). No Prisma, no Nest: unit-testable in
 * isolation. HTTP mapping (409/422) happens in the service.
 */

export const AUTHORIZATION_TYPES = ['exceed_spending_limit', 'additional_work'] as const;

/** Only a pending request can be approved or rejected (§9, matrix #28). */
export function canResolveRequest(status: string): boolean {
  return status === 'pending';
}

/**
 * §20.1 + decision 5: an approved `additional_work` adds the job to the
 * *same* order; terminal orders (completed/cancelled) accept no new work.
 */
export function canApproveAdditionalWork(orderStatus: string): boolean {
  return orderStatus !== 'completed' && orderStatus !== 'cancelled';
}

/**
 * An amount, when given, must authorize something (§11): null (omitted,
 * §18.1 «tope opcional») is fine; zero or negative is not.
 */
export function isValidAuthorizationAmount(amountCents: number | null): boolean {
  return amountCents === null || amountCents > 0;
}

/** An offline record's granted time can't be in the future (§11). */
export function isGrantedAtValid(grantedAt: Date, now: Date): boolean {
  return grantedAt.getTime() <= now.getTime();
}
