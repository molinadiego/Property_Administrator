/**
 * Pure validation rules for commercial relations (spec etapa-4.md §2.4, §8.6,
 * decision 4). No Prisma, no Nest: unit-testable in isolation.
 */

export type CounterpartyInput = {
  counterpartyCompanyId?: string | null;
  clientRelationshipId?: string | null;
};

export type CounterpartyValidation = 'ok' | 'none' | 'both' | 'self';

/**
 * Exactly one counterparty (§2.4): a company or an own-client relationship,
 * never both and never the company itself.
 */
export function validateCounterparty(
  input: CounterpartyInput,
  ownCompanyId: string,
): CounterpartyValidation {
  const hasCompany = Boolean(input.counterpartyCompanyId);
  const hasClient = Boolean(input.clientRelationshipId);
  if (hasCompany && hasClient) return 'both';
  if (!hasCompany && !hasClient) return 'none';
  if (input.counterpartyCompanyId === ownCompanyId) return 'self';
  return 'ok';
}

/** An ended relation doesn't attach to new orders (§2.4); existing orders keep it. */
export function isRelationAttachable(relation: { endedAt: Date | null }): boolean {
  return relation.endedAt === null;
}

/** The order's company must be one of the relation's two parties (§2.4). */
export function relationGovernsCompany(
  relation: { companyId: string; counterpartyCompanyId: string | null },
  companyId: string,
): boolean {
  return relation.companyId === companyId || relation.counterpartyCompanyId === companyId;
}
