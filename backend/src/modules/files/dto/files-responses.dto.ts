import { ApiProperty } from '@nestjs/swagger';
import { FileKind, FileTargetType } from '../../../generated/prisma/enums';

/**
 * Response DTOs for the file endpoints (Option A, approved 21/10/2026:
 * frontend spec F5-D1). Documentation only — no behaviour change — they
 * mirror the existing serialization (`FilesService` metadata) so the
 * generated API client gets real types (frontend AGENTS.md).
 */

/** Metadata of one stored file (§7.1); `deletedAt` marks a retired file (§1.1.8). */
export class FileViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid', description: 'Orden a la que pertenece el archivo' })
  orderId: string;

  @ApiProperty({ enum: FileTargetType, description: 'Destino: la orden o un trabajo' })
  targetType: FileTargetType;

  @ApiProperty({ format: 'uuid', description: 'Id del destino según targetType (orden o trabajo)' })
  targetId: string;

  @ApiProperty({ enum: FileKind, description: 'Evidencia: foto o documento (§7.1)' })
  kind: FileKind;

  @ApiProperty({ description: 'Nombre saneado del archivo' })
  filename: string;

  @ApiProperty({ description: 'Content type aceptado por la allowlist (etapa-3 §11)' })
  contentType: string;

  @ApiProperty({ description: 'Tamaño en bytes (máx. 10 MB, etapa-3 §11)' })
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

/** GET /companies/:id/orders/:orderId/files: visible metadata of the order (§4.4). */
export class FileListViewDto {
  @ApiProperty({ type: [FileViewDto] })
  data: FileViewDto[];
}
