import { ApiProperty } from '@nestjs/swagger';
import { CompanyType, MembershipRole } from '../../../generated/prisma/enums';

/**
 * Response DTOs for the auth endpoints. They document the existing responses
 * in OpenAPI (documentation only: no behaviour change) so the generated API
 * client (frontend) gets real types instead of `never` (frontend AGENTS.md:
 * the API client is only generated, types are never written by hand).
 */

/** Active membership of the current user in a company (§5 memberships). */
export class MembershipViewDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Id de la membresía — la UI identifica así «sus» asignaciones (F2-D2)',
  })
  id: string;

  @ApiProperty({ format: 'uuid', description: 'Identificador del espacio (empresa)' })
  companyId: string;

  @ApiProperty({ description: 'Nombre del espacio' })
  companyName: string;

  @ApiProperty({ enum: CompanyType, description: 'Tipo de espacio (§2.1)' })
  companyType: CompanyType;

  @ApiProperty({ enum: MembershipRole, description: 'Rol del usuario en el espacio (§5)' })
  role: MembershipRole;

  @ApiProperty({
    format: 'date-time',
    description: 'Fecha de alta de la membresía (ISO 8601)',
    example: '2026-01-15T10:30:00.000Z',
  })
  joinedAt: string;
}

/** Minimal user identity returned by login. */
export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ description: 'Nombre visible del usuario' })
  name: string;
}

/** `GET /auth/me`: current user and active memberships with role. */
export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ description: 'Nombre visible del usuario' })
  name: string;

  @ApiProperty({
    type: [MembershipViewDto],
    description: 'Membresías activas con rol (puede ser vacío)',
  })
  memberships: MembershipViewDto[];
}

/** `POST /auth/login`: session cookie is set; token is not exposed. */
export class LoginResponseDto {
  @ApiProperty({ type: AuthUserDto, description: 'Usuario autenticado' })
  user: AuthUserDto;
}
