import { ApiProperty } from '@nestjs/swagger';
import { CompanyType, MembershipRole } from '../../../generated/prisma/enums';

/**
 * Response DTOs for the company endpoints (Option A, approved 20/10/2026:
 * frontend spec F1-D3). They document the existing responses in OpenAPI —
 * documentation only, no behaviour change — so the generated API client
 * (frontend) gets real types instead of `unknown` (frontend AGENTS.md: the
 * API client is only generated, types are never written by hand).
 */

/** POST /companies: the created space, with its creator as owner (§3.1). */
export class CompanyCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Propiedades del Sur' })
  name: string;

  @ApiProperty({ enum: CompanyType, description: 'Tipo de espacio (§2.1)' })
  type: CompanyType;

  @ApiProperty({ format: 'date-time', example: '2026-01-15T10:30:00.000Z' })
  createdAt: string;
}

/** One active member of a space (GET /companies/:id/members, §3.2). */
export class CompanyMemberDto {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'Nombre visible del miembro' })
  name: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: MembershipRole, description: 'Rol en el espacio (§3)' })
  role: MembershipRole;

  @ApiProperty({ format: 'date-time', example: '2026-01-15T10:30:00.000Z' })
  joinedAt: string;
}

/** PATCH /companies/:id/members/:membershipId: the updated role. */
export class ChangeMemberRoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({ enum: MembershipRole })
  role: MembershipRole;
}
