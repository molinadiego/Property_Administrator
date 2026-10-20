import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../../../generated/prisma/enums';

/**
 * Response DTOs for `GET /notifications` (Option A, approved 20/10/2026:
 * frontend spec F2-D5). Documentation only — no behaviour change — so the
 * generated API client gets real types (frontend AGENTS.md).
 */

/** One in-app notification of the recipient user (§14). */
export class NotificationViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ description: 'Tipo de entidad relacionada (p. ej. assignment)' })
  entityType: string;

  @ApiProperty({ format: 'uuid' })
  entityId: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ruta a la entidad; hoy siempre null — la navegación llega con F4/F5 (F2-D6)',
  })
  link: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Espacio al que pertenece la notificación (§2.4; la portada filtra por el activo, F2-D5)',
  })
  companyId: string;
}

/** GET /notifications: one cursor page of the current user (§14). */
export class NotificationListViewDto {
  @ApiProperty({ type: [NotificationViewDto] })
  data: NotificationViewDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Cursor opaco para la siguiente página; null si no hay más',
  })
  nextCursor: string | null;
}
