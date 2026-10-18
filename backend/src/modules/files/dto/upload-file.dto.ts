import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** Optional classification of an uploaded file (spec §2.6, §4.4). */
export class UploadFileDto {
  @ApiPropertyOptional({ description: 'Tipo de archivo: photo (fotos de campo) o document (§7.6)', enum: ['photo', 'document'] })
  @IsOptional()
  @IsIn(['photo', 'document'])
  kind?: 'photo' | 'document';
}
