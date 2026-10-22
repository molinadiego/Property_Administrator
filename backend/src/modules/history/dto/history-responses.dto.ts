import { ApiProperty } from '@nestjs/swagger';
import { AssignmentStatus, FileKind, FileTargetType, JobStatus, OrderStatus } from '../../../generated/prisma/enums';

/**
 * Response DTOs for the history endpoints (Option A, approved 21/10/2026:
 * frontend spec F5-D1, with `scope`/`shares` from F5-D2). Documentation only —
 * they mirror the existing serialization (`HistoryService`) so the generated
 * API client gets real types (frontend AGENTS.md).
 */

/** Modes the server resolves for a property history (§7.2, F5-D2). */
export const PROPERTY_HISTORY_SCOPE_VALUES = ['full', 'shared', 'own_jobs'] as const;

/** Job projection of every history payload (§7.2–§7.4): terminal result/reason only — free progress notes never travel (etapa-3 §4.5). */
export class HistoryJobViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: JobStatus, description: 'Estado del trabajo (§20.2)' })
  status: JobStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Resultado final registrado al completar (§6.1)',
  })
  result: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Motivo de incompleto/no realizado (§6.2–§6.3)',
  })
  reason: string | null;
}

/** File row inside a history payload (§7.1 metadata visible, §16.5). */
export class HistoryFileViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: FileTargetType })
  targetType: FileTargetType;

  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiProperty({ enum: FileKind })
  kind: FileKind;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  contentType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Retirado lógicamente (§1.1.8); null = activo',
  })
  deletedAt: string | null;
}

/** Property header inside a property history (§7.2). */
export class PropertyHistoryDetailViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Dirección de la propiedad (§7.2)' })
  addressLine: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  state: string;
}

/** Property reference inside the managed/personal history rows (§7.2–§7.4). */
export class HistoryPropertyRefViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Dirección de la propiedad (§7.2)' })
  addressLine: string;

  @ApiProperty()
  city: string;
}

/** One order of a property history (§7.2), with its visible jobs and files. */
export class PropertyHistoryOrderViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: OrderStatus, description: 'Estado de la orden (§20.1)' })
  status: OrderStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Orden de la que surgió esta, si aplica (§20.1)',
  })
  parentOrderId: string | null;

  @ApiProperty({ type: [HistoryJobViewDto] })
  jobs: HistoryJobViewDto[];

  @ApiProperty({ type: [HistoryFileViewDto] })
  files: HistoryFileViewDto[];
}

/** Active antecedent share of the property (§7.5; only the owning company receives rows, F5-D2). */
export class PropertyShareViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid', description: 'Membresía beneficiaria (§7.5)' })
  sharedWithMembershipId: string;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo / antecedentes relevantes (§7.5)' })
  note: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

/** GET /companies/:id/history/properties/:propId (§7.2, F5-D2: `scope` + owner-only `shares`). */
export class PropertyHistoryViewDto {
  @ApiProperty({ type: PropertyHistoryDetailViewDto })
  property: PropertyHistoryDetailViewDto;

  @ApiProperty({
    enum: [...PROPERTY_HISTORY_SCOPE_VALUES],
    description:
      'Modo resuelto por el servidor: full (dueña), shared (share activo) u own_jobs (asignación activa) (§7.2, §7.5)',
  })
  scope: (typeof PROPERTY_HISTORY_SCOPE_VALUES)[number];

  @ApiProperty({ type: [PropertyHistoryOrderViewDto], description: 'Órdenes de la propiedad, orden desc' })
  orders: PropertyHistoryOrderViewDto[];

  @ApiProperty({
    type: [PropertyShareViewDto],
    description: 'Shares activos; solo la empresa dueña recibe filas (F5-D2, §7.5)',
  })
  shares: PropertyShareViewDto[];
}

/** One order managed by the space (§7.3, §7.4): own orders plus every order it ever held an assignment on. */
export class ManagedOrderViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: string | null;

  @ApiProperty({ type: HistoryPropertyRefViewDto })
  property: HistoryPropertyRefViewDto;

  @ApiProperty({ type: [HistoryJobViewDto] })
  jobs: HistoryJobViewDto[];
}

/** GET /companies/:id/history/orders (§7.3). */
export class ManagedOrderListViewDto {
  @ApiProperty({ type: [ManagedOrderViewDto] })
  data: ManagedOrderViewDto[];
}

/** Share returned by POST /companies/:id/history/shares (§7.5). */
export class CreatedShareViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  propertyId: string;

  @ApiProperty({ format: 'uuid', description: 'Membresía beneficiaria (§7.5)' })
  sharedWithMembershipId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

/** Order reference of a personal-history row (§7.2). */
export class JobHistoryOrderViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;
}

/** One own job of the personal history (§7.2): the job projection plus its latest assignment status and references. */
export class JobHistoryEntryViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Resultado final (§6.1)' })
  result: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo de incompleto/no realizado (§6.2–§6.3)' })
  reason: string | null;

  @ApiProperty({
    enum: AssignmentStatus,
    nullable: true,
    description: 'Estado de la asignación más reciente de la persona en ese trabajo (§20.3)',
  })
  assignmentStatus: AssignmentStatus | null;

  @ApiProperty({ type: JobHistoryOrderViewDto })
  order: JobHistoryOrderViewDto;

  @ApiProperty({ type: HistoryPropertyRefViewDto, description: 'Propiedad con id para navegar a su historial (F5-D3, §7.2)' })
  property: HistoryPropertyRefViewDto;
}

/** GET /me/job-history (§7.2): session-scoped personal history. */
export class JobHistoryListViewDto {
  @ApiProperty({ type: [JobHistoryEntryViewDto] })
  data: JobHistoryEntryViewDto[];
}
