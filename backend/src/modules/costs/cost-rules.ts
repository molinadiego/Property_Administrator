import { toCents } from '../economic-settings/spending-rules';

/**
 * Pure rules for cost reports (spec etapa-4.md §4.3, §8.1–§8.3). No Prisma,
 * no Nest: unit-testable in isolation. HTTP mapping (409/422) happens in the
 * service, not here.
 */

export const COST_CATEGORIES = ['material', 'labor', 'other'] as const;

export const COST_ITEM_DESCRIPTION_MAX = 500;

export type CostItemInput = {
  category: string;
  description: string;
  amount: string;
  isEmergency?: boolean;
};

export type CostItemsValidation = { valid: true } | { valid: false; reason: string };

/** Items: known category, non-empty description, valid non-negative amount. */
export function validateCostItems(items: CostItemInput[]): CostItemsValidation {
  for (const item of items) {
    if (!COST_CATEGORIES.includes(item.category as (typeof COST_CATEGORIES)[number])) {
      return { valid: false, reason: 'Categoría de costo inválida.' };
    }
    const description = item.description?.trim() ?? '';
    if (description.length < 1 || item.description.length > COST_ITEM_DESCRIPTION_MAX) {
      return { valid: false, reason: 'La descripción del ítem es obligatoria (máx. 500 caracteres).' };
    }
    let cents: number;
    try {
      cents = toCents(item.amount);
    } catch {
      return { valid: false, reason: 'Importe inválido: debe ser un decimal con hasta 2 decimales.' };
    }
    if (cents < 0) {
      return { valid: false, reason: 'El importe no puede ser negativo.' };
    }
  }
  return { valid: true };
}

/** Report total: sum of the items as integer cents (§8.1). */
export function totalCentsOf(items: ReadonlyArray<{ amount: string }>): number {
  return items.reduce((sum, item) => sum + toCents(item.amount), 0);
}

/**
 * Submit permission (decision 8, §1.2): the assignment must have reached
 * `accepted` at least once (§20.2 keeps «cualquier costo incurrido»). A
 * `revoked` assignment did so iff it was responded — `responded_at` is set
 * on accept, and a revoke from `pending` leaves it null. `pending` and
 * `rejected` never submit.
 */
export function canSubmitCostReport(assignment: {
  status: string;
  respondedAt: Date | null;
}): boolean {
  if (assignment.status === 'accepted') return true;
  if (assignment.status === 'revoked') return assignment.respondedAt !== null;
  return false;
}

/** Next version number of an assignment's report chain (§8.2). */
export function nextVersionNumber(latestVersion: number | null): number {
  return latestVersion === null ? 1 : latestVersion + 1;
}
