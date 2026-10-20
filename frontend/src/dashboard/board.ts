import type {
  NotificationListViewDto,
  NotificationViewDto,
  OrderStatus,
  OrderViewDto,
} from '@/api/types';

/**
 * Pure derivations of the dashboard (spec F2-D2/D4): the page renders these
 * results; tests and the e2e flows assert them. Business rules live in the
 * server (§2.12); these helpers only shape what the server already decided.
 */

/** i18n keys for the official order-status labels (mapping BE-2 R5, §20.1). */
export const ORDER_STATUS_KEYS: Record<OrderStatus, string> = {
  requested: 'status.requested',
  open: 'status.open',
  in_progress: 'status.in_progress',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
};

/** One pending assignment row of the current user (F2-D2): one row per
 * assignment (§20.3), unlike the order list which groups jobs per order. */
export interface PendingAssignmentRow {
  assignmentId: string;
  orderId: string;
  orderTitle: string;
  jobTitle: string;
  createdAt: string;
}

/**
 * Orders of the active space only (§2.4): the server's list also carries the
 * caller's cross-space assignments (§2.12 visibility, consumed by F4's list),
 * but the per-space portada never renders them (spec F2 §8, flow 4).
 */
export function spaceOrders(
  orders: OrderViewDto[] | undefined,
  companyId: string,
): OrderViewDto[] {
  return (orders ?? []).filter((order) => order.companyId === companyId);
}

/**
 * Flattens the pending-assignment orders into rows that belong to the user:
 * `assigneeMembershipId` ∈ the ids of their memberships (`me.id`, F2-D2), and
 * the order belongs to the active space (§2.4). Assignments of other members
 * of the same space never become rows here.
 */
export function pendingAssignmentRows(
  orders: OrderViewDto[] | undefined,
  membershipIds: readonly string[],
  companyId: string,
): PendingAssignmentRow[] {
  if (!orders) return [];
  const own = new Set(membershipIds);
  const rows: PendingAssignmentRow[] = [];
  for (const order of orders) {
    if (order.companyId !== companyId) continue;
    for (const job of order.jobs) {
      for (const assignment of job.assignments) {
        if (assignment.status === 'pending' && own.has(assignment.assigneeMembershipId)) {
          rows.push({
            assignmentId: assignment.id,
            orderId: order.id,
            orderTitle: order.title,
            jobTitle: job.title,
            createdAt: assignment.createdAt,
          });
        }
      }
    }
  }
  return rows;
}

/** Notifications of the active space only (§2.4, F2-D5): those of other
 * spaces of the user are never rendered nor counted, even when loaded. */
export function spaceNotifications(
  pages: NotificationListViewDto[] | undefined,
  companyId: string | null,
): NotificationViewDto[] {
  if (!companyId) return [];
  return (pages ?? []).flatMap((page) => page.data).filter((n) => n.companyId === companyId);
}

/** Unread badge over the loaded set (F2-D4: no server-side counter, BE-1 §1.1). */
export function unreadNotificationCount(notifications: NotificationViewDto[]): number {
  return notifications.filter((n) => n.readAt === null).length;
}
