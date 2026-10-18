import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsMoneyAmount } from '../../../common/dto/money';
import {
  INVOICE_LINE_DESCRIPTION_MAX,
  INVOICE_LINE_KINDS,
  INVOICE_LINES_MAX,
} from '../invoice-rules';

/** One invoice line (spec etapa-5 §2.3, proyect.md §11.1). */
export class InvoiceLineDto {
  @ApiProperty({ description: 'Trabajo de la orden del que proviene el renglón (§11.1)' })
  @IsUUID()
  jobId: string;

  @ApiProperty({ description: 'Concepto', enum: INVOICE_LINE_KINDS })
  @IsIn([...INVOICE_LINE_KINDS])
  kind: (typeof INVOICE_LINE_KINDS)[number];

  @ApiProperty({ example: 'Reemplazo de mezcladera' })
  @IsString()
  @MinLength(1)
  @MaxLength(INVOICE_LINE_DESCRIPTION_MAX)
  description: string;

  @ApiProperty({ description: 'Importe en USD con hasta 2 decimales', example: '85.00' })
  @IsMoneyAmount()
  amount: string;
}

/** Replaces the whole draft's lines (put-list pattern, spec §4.1). */
export class PutInvoiceLinesDto {
  @ApiProperty({ type: [InvoiceLineDto], description: 'Lista completa de renglones' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(INVOICE_LINES_MAX)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
}
