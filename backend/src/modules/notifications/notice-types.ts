/**
 * Closed set of notice types whose email the user can toggle (spec
 * etapa-6.md §2.6, D6): every in-app notification type plus the business
 * emails of Etapa 4 (costs, authorizations) and Etapa 5 (billing).
 *
 * Authentication-critical emails (password reset, limited-access link)
 * and invitations are account mechanisms, not notices: they are never
 * optional (D6, AC-6.19, AC-6.34).
 */
export const NOTICE_TYPES = [
  // In-app notification types (etapa-2 §2.9 + etapa-6 §2.7)
  'order_created',
  'order_assigned',
  'assignment_requested',
  'assignment_accepted',
  'assignment_rejected',
  'job_added',
  'urgent_reminder',
  'urgent_escalated',
  // Business emails (etapa-4 §14.1, etapa-5)
  'costs_submitted',
  'cost_corrected',
  'cost_correction_notice',
  'authorization_requested',
  'authorization_resolved',
  'invoice_issued',
  'invoice_voided',
  'payment_recorded',
  'payment_duplicate_suspect',
] as const;

export type NoticeType = (typeof NOTICE_TYPES)[number];

export function isNoticeType(value: string): value is NoticeType {
  return (NOTICE_TYPES as readonly string[]).includes(value);
}
