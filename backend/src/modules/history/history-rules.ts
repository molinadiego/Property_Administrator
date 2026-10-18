/**
 * Pure scoping rules for property history and `history_shares`
 * (docs/especificacion/etapa-3.md §5 rules 8-9, §8). No Nest, no Prisma.
 */

export type PropertyHistoryScope = 'full' | 'shared' | 'own_jobs' | 'none';

/**
 * Who may see a property's history and how much (§7.2, §7.5):
 *
 * - the owning company sees the complete history;
 * - an active `history_share` shows the shared antecedents (same records);
 * - an active assignment **without** a share shows only the caller's jobs;
 * - anything else is out of scope (404, existence never leaked).
 */
export function propertyHistoryScope(input: {
  propertyCompanyId: string;
  callerCompanyId: string;
  hasActiveShare: boolean;
  hasActiveAssignment: boolean;
}): PropertyHistoryScope {
  if (input.propertyCompanyId === input.callerCompanyId) return 'full';
  if (input.hasActiveShare) return 'shared';
  if (input.hasActiveAssignment) return 'own_jobs';
  return 'none';
}
