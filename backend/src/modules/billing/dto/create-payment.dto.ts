import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsMoneyAmount } from '../../../common/dto/money';
import {
  NOTES_MAX,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PAYMENT_REFERENCE_MAX,
} from '../invoice-rules';

/** Registers a payment or a refund against an invoice (§11.1, decisión P5). */
export class CreatePaymentDto {
  @ApiProperty({ description: 'Importe en USD con hasta 2 decimales', example: '500.00' })
  @IsMoneyAmount()
  amount: string;

  @ApiProperty({ description: 'Fecha del pago (YYYY-MM-DD); no puede ser futura (D7)' })
  @IsDateString()
  paidAt: string;

  @ApiPropertyOptional({ description: 'charge = pago (default), refund = devolución (§12)', enum: PAYMENT_KINDS })
  @IsOptional()
  @IsIn([...PAYMENT_KINDS])
  kind?: (typeof PAYMENT_KINDS)[number];

  @ApiPropertyOptional({ description: 'Medio de pago', enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn([...PAYMENT_METHODS])
  method?: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ description: 'Referencia o comprobante (parte de la comparación de duplicados, §11.1)' })
  @IsOptional()
  @IsString()
  @MaxLength(PAYMENT_REFERENCE_MAX)
  reference?: string;

  @ApiPropertyOptional({ description: 'Notas del registrante' })
  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string;
}
