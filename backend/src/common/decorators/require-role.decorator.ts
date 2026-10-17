import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ROLE_KEY = 'requireRole';

export type CompanyRole = 'owner' | 'member';

/**
 * Requires an active membership with at least this role inside the company
 * resolved by CompanyAccessGuard (spec §5: owner administers, member operates).
 */
export const RequireRole = (role: CompanyRole) => SetMetadata(REQUIRE_ROLE_KEY, role);
