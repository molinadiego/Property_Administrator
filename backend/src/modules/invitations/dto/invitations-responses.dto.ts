import { ApiProperty } from '@nestjs/swagger';
import { InvitationStatus, MembershipRole } from '../../../generated/prisma/enums';

/**
 * Response DTOs for the invitation endpoints (Option A, approved 20/10/2026:
 * frontend spec F1-D3). Documentation only — no behaviour change — so the
 * generated API client gets real types (frontend AGENTS.md).
 */

/** One invitation row (POST + GET /companies/:id/invitations, §3.2). */
export class InvitationViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: MembershipRole, description: 'Rol que otorga (§3)' })
  role: MembershipRole;

  @ApiProperty({ enum: InvitationStatus, description: 'Estado de la invitación' })
  status: InvitationStatus;

  @ApiProperty({ format: 'date-time', example: '2026-11-01T00:00:00.000Z' })
  expiresAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-15T10:30:00.000Z' })
  createdAt: string;
}

/** GET /companies/:id/invitations: one cursor page (owner). */
export class InvitationListViewDto {
  @ApiProperty({ type: [InvitationViewDto] })
  data: InvitationViewDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Cursor opaco para la siguiente página; null si no hay más',
  })
  nextCursor: string | null;
}

/** GET /invitations/:token: public preview — never the raw token (§3.2). */
export class InvitationPreviewDto {
  @ApiProperty({ description: 'Nombre del espacio' })
  companyName: string;

  @ApiProperty({ description: 'Email del destinatario enmascarado', example: 'a****@demo.test' })
  emailMasked: string;

  @ApiProperty({ enum: MembershipRole, description: 'Rol que otorga la invitación' })
  role: MembershipRole;

  @ApiProperty({ format: 'date-time', example: '2026-11-01T00:00:00.000Z' })
  expiresAt: string;
}
