import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { EXPORT_FORMATS } from '../invoice-rules';

/** Filters of the accounting export (spec etapa-5 D11, proyect.md §3.5, §16.10). */
export class AccountingExportQueryDto {
  @ApiProperty({ description: 'Formato del archivo', enum: EXPORT_FORMATS })
  @IsIn([...EXPORT_FORMATS])
  format: (typeof EXPORT_FORMATS)[number];

  @ApiPropertyOptional({ description: 'Desde (YYYY-MM-DD, inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Hasta (YYYY-MM-DD, inclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Restringe a una orden' })
  @IsOptional()
  @IsUUID()
  order_id?: string;

  @ApiPropertyOptional({ description: 'Restringe a una contraparte (empresa o tenant)' })
  @IsOptional()
  @IsUUID()
  counterparty_company_id?: string;
}
