import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Base query for cursor-paginated list endpoints (spec §3, "Paginación"). */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cantidad máxima de elementos (1-100)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Cursor opaco devuelto en nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
