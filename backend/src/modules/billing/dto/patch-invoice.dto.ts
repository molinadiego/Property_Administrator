import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
