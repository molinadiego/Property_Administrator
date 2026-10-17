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

export const AUDIT_ENTITIES = {
  USER: 'user',
  COMPANY: 'company',
  MEMBERSHIP: 'membership',
  INVITATION: 'invitation',
  SESSION: 'session',
} as const;
