import type { components } from './generated/schema';

/**
 * Convenience aliases for the response DTOs the UI consumes. The client itself
 * is always generated (`npm run openapi:generate`); these are only aliases, not
 * hand-written API types.
 */
export type MeResponseDto = components['schemas']['MeResponseDto'];
export type AuthUserDto = components['schemas']['AuthUserDto'];
export type LoginResponseDto = components['schemas']['LoginResponseDto'];
export type MembershipViewDto = components['schemas']['MembershipViewDto'];
export type ProblemDetailDto = components['schemas']['ProblemDetailDto'];

/** F1 (spec F1-D3, Option A): typed responses for the endpoints this stage consumes. */
export type CompanyCreatedDto = components['schemas']['CompanyCreatedDto'];
export type CompanyMemberDto = components['schemas']['CompanyMemberDto'];
export type ChangeMemberRoleResponseDto = components['schemas']['ChangeMemberRoleResponseDto'];
export type InvitationViewDto = components['schemas']['InvitationViewDto'];
export type InvitationListViewDto = components['schemas']['InvitationListViewDto'];
export type InvitationPreviewDto = components['schemas']['InvitationPreviewDto'];

/** Space type as accepted by POST /companies (all enum values). */
export type CompanyType = components['schemas']['CreateCompanyDto']['type'];
export type MembershipRole = components['schemas']['ChangeMemberRoleDto']['role'];

/**
 * The three participant types of §2 offered by the creation form (spec F1-D2):
 * `profesional` is a legacy enum value (same concept as `own_business`) and is
 * deliberately not offered in the UI.
 */
export const SELECTABLE_COMPANY_TYPES = [
  'property_management',
  'contractor',
  'own_business',
] as const satisfies readonly CompanyType[];

