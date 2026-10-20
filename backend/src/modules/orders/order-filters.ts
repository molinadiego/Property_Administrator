/**
 * Pure helpers for the order-list query filters (BE-1,
 * docs/especificacion/be-1-filtros-ordenes.md §4–§5).
 *
 * Pattern: modules/orders/job-rules.ts — no Nest runtime, no Prisma runtime;
 * only a type-only import of the generated client (erased at compile time) so
 * the where clause composes with the §2.12 visibility clause and stays
 * unit-testable in isolation.
 */

import type { Prisma } from '../../generated/prisma/client';
import type { OrderStatusValue } from './job-rules';

/** Order states accepted by the `status` filter (§20.1 / BE-1 B1). */
export const ORDER_STATUS_VALUES: readonly OrderStatusValue[] = [
  'requested',
  'open',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
];

/**
 * Assignment states accepted by `assignment_status` (BE-1 B2): only `pending`
 * and `accepted` grant visibility (§2.12), so filtering by `rejected`/`revoked`
 * is meaningless and rejected with 422.
 */
export const ASSIGNMENT_STATUS_VALUES = ['pending', 'accepted'] as const;

export type AssignmentStatusValue = (typeof ASSIGNMENT_STATUS_VALUES)[number];

/** Validated shape of `GET /companies/:id/orders` query filters (BE-1). */
export interface OrderListFilters {
  status?: readonly OrderStatusValue[] | null;
  assignment_status?: AssignmentStatusValue | null;
}

/**
 * Splits and trims the raw `status` query value (BE-1 B1): accepts a
 * comma-separated string or an array of them (repeated params), so
 * `open, assigned` and `open&status=assigned` both parse. An empty value
 * becomes `['']`, which `@IsIn(..., { each: true })` rejects with 422 — the
 * filter is never silently dropped (AC-BE1.4).
 *
 * Returns `undefined` when the param is absent (no transform, no filter).
 */
export function parseStatusFilter(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .flatMap((part) => String(part).split(','))
    .map((part) => part.trim());
}

/**
 * Composes the filter clauses (BE-1 §5) on top of the untouched §2.12
 * visibility clause: each filter is an extra AND term, so filters can only
 * narrow the visible set, never widen it.
 *
 * With no filters the visibility clause is returned as-is (AC-BE1.6: the
 * response must be identical to the pre-filter behavior).
 *
 * @param visibility clause built by the caller (company OR active assignments)
 * @param filters validated query filters
 * @param membershipIds caller's active memberships, scoping `assignment_status`
 */
export function buildOrderListWhere(
  visibility: Prisma.OrderWhereInput,
  filters: OrderListFilters,
  membershipIds: string[],
): Prisma.OrderWhereInput {
  const clauses: Prisma.OrderWhereInput[] = [];

  if (filters.status && filters.status.length > 0) {
    clauses.push({ status: { in: [...filters.status] } });
  }

  if (filters.assignment_status) {
    clauses.push({
      jobs: {
        some: {
          assignments: {
            some: {
              assigneeMembershipId: { in: membershipIds },
              status: filters.assignment_status,
            },
          },
        },
      },
    });
  }

  if (clauses.length === 0) return visibility;
  return { AND: [visibility, ...clauses] };
}
