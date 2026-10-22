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

/** F2 (spec F2-D5, Option A): typed responses for the endpoints the dashboard consumes. */
export type OrderViewDto = components['schemas']['OrderViewDto'];
export type OrderStatus = OrderViewDto['status'];
export type NotificationViewDto = components['schemas']['NotificationViewDto'];
export type NotificationListViewDto = components['schemas']['NotificationListViewDto'];

/** F3 (spec F3-D1/F3-D2, Option A): typed responses for catalogs and the limited portal. */
export type PropertyViewDto = components['schemas']['PropertyViewDto'];
export type PropertyDetailViewDto = components['schemas']['PropertyDetailViewDto'];
export type PropertyTenantViewDto = components['schemas']['PropertyTenantViewDto'];
export type CreatePropertyDto = components['schemas']['CreatePropertyDto'];
export type UpdatePropertyDto = components['schemas']['UpdatePropertyDto'];
export type CreatePropertyTenantDto = components['schemas']['CreatePropertyTenantDto'];
export type UpdateTenantDto = components['schemas']['UpdateTenantDto'];
export type TenantAccessResultViewDto = components['schemas']['TenantAccessResultViewDto'];
export type ClientViewDto = components['schemas']['ClientViewDto'];
export type ClientCreateResultViewDto = components['schemas']['ClientCreateResultViewDto'];
export type CreateClientDto = components['schemas']['CreateClientDto'];
export type CommercialRelationViewDto = components['schemas']['CommercialRelationViewDto'];
export type CreateCommercialRelationDto = components['schemas']['CreateCommercialRelationDto'];
export type UpdateCommercialRelationDto = components['schemas']['UpdateCommercialRelationDto'];
export type LimitedOrderViewDto = components['schemas']['LimitedOrderViewDto'];
export type LimitedPropertyViewDto = components['schemas']['LimitedPropertyViewDto'];
export type LimitedRequestViewDto = components['schemas']['LimitedRequestViewDto'];
export type LimitedInvoiceViewDto = components['schemas']['LimitedInvoiceViewDto'];
export type LimitedInvoiceDetailViewDto = components['schemas']['LimitedInvoiceDetailViewDto'];
export type CreateRequestDto = components['schemas']['CreateRequestDto'];

/** F4 (spec F4-D1, Option A): typed responses for orders, jobs and assignments. */
export type JobViewDto = components['schemas']['JobViewDto'];
export type AssignmentViewDto = components['schemas']['AssignmentViewDto'];
export type CreateOrderDto = components['schemas']['CreateOrderDto'];
export type UpdateOrderDto = components['schemas']['UpdateOrderDto'];
export type AddJobDto = components['schemas']['AddJobDto'];
export type CreateAssignmentDto = components['schemas']['CreateAssignmentDto'];
export type JobStatus = JobViewDto['status'];
export type AssignmentStatus = AssignmentViewDto['status'];
export type OrderOrigin = OrderViewDto['origin'];

/** F5 (spec F5-D1…F5-D3, Option A): typed responses for files and history. */
export type FileViewDto = components['schemas']['FileViewDto'];
export type FileListViewDto = components['schemas']['FileListViewDto'];
export type UploadFileDto = components['schemas']['UploadFileDto'];
export type PropertyHistoryViewDto = components['schemas']['PropertyHistoryViewDto'];
export type PropertyHistoryScope = PropertyHistoryViewDto['scope'];
export type PropertyHistoryOrderViewDto = components['schemas']['PropertyHistoryOrderViewDto'];
export type PropertyShareViewDto = components['schemas']['PropertyShareViewDto'];
export type CreatedShareViewDto = components['schemas']['CreatedShareViewDto'];
export type CreateShareDto = components['schemas']['CreateShareDto'];
export type ManagedOrderListViewDto = components['schemas']['ManagedOrderListViewDto'];
export type ManagedOrderViewDto = components['schemas']['ManagedOrderViewDto'];
export type JobHistoryListViewDto = components['schemas']['JobHistoryListViewDto'];
export type JobHistoryEntryViewDto = components['schemas']['JobHistoryEntryViewDto'];
export type HistoryJobViewDto = components['schemas']['HistoryJobViewDto'];
export type HistoryFileViewDto = components['schemas']['HistoryFileViewDto'];
export type FileKind = FileViewDto['kind'];
export type FileTargetType = FileViewDto['targetType'];

/** Occupancy of a property ficha (§4.2) and tenant kind (§4.3). */
export type PropertyOccupancy = PropertyViewDto['occupancy'];
export type PropertyTenantKind = PropertyTenantViewDto['kind'];
/** Emergency-policy override of a commercial relation (§8.6). */
export type EmergencyPolicyValue = CommercialRelationViewDto['emergencyPolicy'];
/** Derived invoice status of the limited portal (etapa-5). */
export type LimitedInvoiceStatus = LimitedInvoiceViewDto['status'];

