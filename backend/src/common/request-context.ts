import { CompanyRole } from './decorators/require-role.decorator';

/** Auth context attached to the request by SessionGuard. */
export interface AuthContext {
  userId: string;
  sessionId: string;
}

/** Company context attached to the request by CompanyAccessGuard. */
export interface CompanyAccess {
  companyId: string;
  membershipId: string;
  role: CompanyRole;
}

/** Express request enriched with the guard contexts. */
export interface AuthenticatedRequest {
  auth?: AuthContext;
  company?: CompanyAccess;
  cookies?: Record<string, string>;
  headers: Record<string, unknown>;
  ip?: string;
}
