/** Audit actions of Etapa 1 (spec etapa-1.md §7). */
export const AUDIT_ACTIONS = {
  USER_REGISTERED: 'user.registered',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  COMPANY_CREATED: 'company.created',
  COMPANY_UPDATED: 'company.updated',
  MEMBER_INVITED: 'member.invited',
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_REVOKED: 'invitation.revoked',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_ACCESS_REVOKED: 'member.access_revoked',
} as const;

/** Audit actions of Etapa 2 (spec etapa-2.md §7). */
export const AUDIT_ACTIONS_ETAPA2 = {
  PROPERTY_CREATED: 'property.created',
  PROPERTY_UPDATED: 'property.updated',
  PROPERTY_TENANT_ADDED: 'property_tenant.added',
  TENANT_UPDATED: 'tenant.updated',
  CLIENT_CREATED: 'client.created',
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_CONVERTED_FROM_REQUEST: 'order.converted_from_request',
  JOB_ADDED: 'job.added',
  ASSIGNMENT_CREATED: 'assignment.created',
  ASSIGNMENT_ACCEPTED: 'assignment.accepted',
  ASSIGNMENT_REJECTED: 'assignment.rejected',
  ASSIGNMENT_REASSIGNED: 'assignment.reassigned',
} as const;

/** Audit actions of Etapa 3 (spec etapa-3.md §7). Free progress notes are
 * intentionally absent: their history lives in `job_events` (§2.5, §7). */
export const AUDIT_ACTIONS_ETAPA3 = {
  JOB_STARTED: 'job.started',
  JOB_COMPLETED: 'job.completed',
  JOB_INCOMPLETE: 'job.incomplete',
  JOB_RESUMED: 'job.resumed',
  JOB_NOT_REALIZED: 'job.not_realized',
  ORDER_CLOSED: 'order.closed',
  ORDER_CANCELLED: 'order.cancelled',
  ASSIGNMENT_REVOKED: 'assignment.revoked',
  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',
  HISTORY_SHARE_CREATED: 'history_share.created',
  HISTORY_SHARE_REVOKED: 'history_share.revoked',
} as const;

export const AUDIT_ENTITIES = {
  USER: 'user',
  COMPANY: 'company',
  MEMBERSHIP: 'membership',
  INVITATION: 'invitation',
  SESSION: 'session',
} as const;

export const AUDIT_ENTITIES_ETAPA2 = {
  PROPERTY: 'property',
  PROPERTY_TENANT: 'property_tenant',
  TENANT: 'tenant',
  CLIENT_RELATIONSHIP: 'client_relationship',
  ORDER: 'order',
  JOB: 'job',
  ASSIGNMENT: 'assignment',
} as const;

/** Audit entities of Etapa 3 (spec etapa-3.md §7). */
export const AUDIT_ENTITIES_ETAPA3 = {
  FILE: 'file',
  HISTORY_SHARE: 'history_share',
} as const;
