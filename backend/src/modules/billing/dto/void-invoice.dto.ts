import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { VOID_REASON_MAX } from '../invoice-rules';

/** Voids an emitted invoice, keeping it and its payments (§11.5). */
export class VoidInvoiceDto {
  @ApiProperty({ description: 'Motivo obligatorio de la anulación (§11.5)' })
  @IsString()
  @MinLength(1)
  @MaxLength(VOID_REASON_MAX)
  reason: string;
}
