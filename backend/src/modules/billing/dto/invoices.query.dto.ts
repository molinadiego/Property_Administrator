import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** List filters of company invoices (emitted + received, §11.3). */
export class InvoicesQueryDto {
  @ApiPropertyOptional({ description: 'Estado filtrado; overdue cubre vencidas con saldo (§11.2)' })
  @IsOptional()
  @IsIn(['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'voided'])
  status?: string;

  @ApiPropertyOptional({ description: 'Restringe a una orden' })
  @IsOptional()
  @IsUUID()
  order_id?: string;

  @ApiPropertyOptional({ description: 'Contraparte (empresa emisora o destinataria)' })
  @IsOptional()
  @IsUUID()
  counterparty_company_id?: string;

  @ApiPropertyOptional({ description: 'Tamaño de página (default 50)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Cursor opaco de la página anterior' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
