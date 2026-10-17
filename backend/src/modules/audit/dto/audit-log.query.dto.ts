import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.query.dto';

/** Filters for GET /companies/:id/audit-log (spec §4.4). */
export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtra por acción exacta, p. ej. member.invited' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filtra por tipo de entidad, p. ej. membership' })
  @IsOptional()
  @IsString()
  entity_type?: string;

  @ApiPropertyOptional({ description: 'Fecha inicial inclusive (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fecha final inclusive (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
