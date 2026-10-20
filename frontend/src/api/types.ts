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
