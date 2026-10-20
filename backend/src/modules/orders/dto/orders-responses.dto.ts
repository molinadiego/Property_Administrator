import { ApiProperty } from '@nestjs/swagger';
import {
  AssignmentStatus,
  JobStatus,
  OrderOrigin,
  OrderStatus,
} from '../../../generated/prisma/enums';

/**
 * Response DTOs for the order endpoints (Option A, approved 20/10/2026:
 * frontend spec F2-D5). Documentation only — no behaviour change — they mirror
 * the existing serialization (`orders.service.serialize`/`jobsOf`) so the
 * generated API client gets real types (frontend AGENTS.md).
 */

/** One assignment row of a job (§20.3: each assignment is its own record). */
export class AssignmentViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: AssignmentStatus, description: 'Estado de la asignación (§20.3)' })
  status: AssignmentStatus;

  @ApiProperty({ format: 'uuid', description: 'Membresía del asignado' })
  assigneeMembershipId: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  respondedAt: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo del rechazo si lo hay (§5.6)' })
  rejectionReason: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

/** One job of an order (§5.5), with its assignments. */
export class JobViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ enum: JobStatus, description: 'Estado del trabajo (§20.2)' })
  status: JobStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: string | null;

  @ApiProperty({ type: [AssignmentViewDto] })
  assignments: AssignmentViewDto[];
}

/** Visit access info of the order (§4.5/§5.8); only for authorized viewers. */
export class OrderAccessViewDto {
  @ApiProperty({ type: String, nullable: true })
  lockbox: string | null;

  @ApiProperty({ type: String, nullable: true })
  communityCode: string | null;

  @ApiProperty({ type: String, nullable: true })
  entryInstructions: string | null;
}

/** One serialized order (§2.12 visibility applied by the server). */
export class OrderViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: OrderStatus, description: 'Estado (mapeo §20.1, BE-2 R5)' })
  status: OrderStatus;

  @ApiProperty({ description: 'Marca de urgencia (§14.2)' })
  urgent: boolean;

  @ApiProperty({ enum: OrderOrigin })
  origin: OrderOrigin;

  @ApiProperty({ format: 'uuid', description: 'Propiedad vinculada (§5.1)' })
  propertyId: string;

  @ApiProperty({ format: 'uuid' })
  companyId: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  parentOrderId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  closedBy: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  cancelledBy: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancellationReason: string | null;

  @ApiProperty({
    type: OrderAccessViewDto,
    nullable: true,
    description: 'Acceso de la visita solo para quien está autorizado (§4.5/§5.8); null si no',
  })
  access: OrderAccessViewDto | null;

  @ApiProperty({ type: [JobViewDto] })
  jobs: JobViewDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
