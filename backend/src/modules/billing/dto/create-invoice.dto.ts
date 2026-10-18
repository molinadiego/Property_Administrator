import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { NOTES_MAX } from '../invoice-rules';

/** Creates an editable invoice draft for an order the company may bill. */
export class CreateInvoiceDto {
  @ApiProperty({ description: 'Orden facturada (v1: una sola orden por factura, §11.1)' })
  @IsUUID()
  orderId: string;

  @ApiPropertyOptional({ description: 'Notas del emisor (editables solo en borrador)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(NOTES_MAX)
  notes?: string;
}
