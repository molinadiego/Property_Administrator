import { ApiProperty } from '@nestjs/swagger';
import { EmergencyPolicyValue } from '../spending-rules';

/**
 * Response DTO for the commercial-relation endpoints (Option A, approved
 * 20/10/2026: frontend spec F3-D1). Documentation only — no behaviour
 * change — it mirrors the existing serialization
 * (`economic-settings.service.serializeRelation`) so the generated API
 * client gets real types (frontend AGENTS.md).
 */

/** One commercial relation governed by the calling company (§2.4,
 * etapa-4.md §4.7): exactly one counterparty, optional emergency
 * override (§8.6). */
export class CommercialRelationViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Nombre comercial de la relación' })
  label: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  counterpartyCompanyId: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  counterpartyCompanyName: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  clientRelationshipId: string | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Cliente propio de la relación' })
  clientName: string | null;

  @ApiProperty({
    enum: ['prior_authorization', 'resolve_without_authorization', 'emergency_amount'],
    description: 'Override de política de emergencia (§8.6)',
  })
  emergencyPolicy: EmergencyPolicyValue;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description: 'Importe del override en formato decimal string (§12)',
  })
  emergencyExtraAmount: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
    description: 'Cierre de la relación: no admite órdenes nuevas (§2.4)',
  })
  endedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
