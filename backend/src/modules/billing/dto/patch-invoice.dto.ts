import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsTaxRate } from '../../../common/dto/tax-rate';
import { NOTES_MAX } from '../invoice-rules';

/** Edits the mutable fields of a draft (§11.5: emitted invoices never edit). */
export class PatchInvoiceDto {
  @ApiPropertyOptional({ description: 'Notas del emisor; cadena vacía las borra' })
  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string;

  @ApiPropertyOptional({ description: 'Fecha de vencimiento (YYYY-MM-DD); default emisión + 30 días (D3)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    description:
      'Tasa de impuesto de esta factura en % (0–100, ≤ 3 decimales); default la del perfil fiscal. ' +
      'null limpia el ajuste (etapa-7.md D3, destination-based)',
    example: '8.375',
    nullable: true,
  })
  @IsOptional()
  @IsTaxRate()
  taxRate?: string | null;
}
