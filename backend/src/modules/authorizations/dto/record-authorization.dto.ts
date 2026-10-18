import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsMoneyAmount } from '../../../common/dto/money';
import { AUTHORIZATION_TYPES } from '../authorization-rules';
import { AuthorizationRequestType } from '../../../generated/prisma/client';

/**
 * Records an authorization received off the platform — by telephone or any
 * other medium (spec etapa-4.md §4.5, §8.7, §18.1, decision 1): who granted
 * it, when, what was authorized, optional cap and who wrote it down. The
 * record is an auditable constancia; it never rewrites costs or states.
 */
export class RecordAuthorizationDto {
  @ApiProperty({ enum: AUTHORIZATION_TYPES })
  @IsIn([...AUTHORIZATION_TYPES])
  type: AuthorizationRequestType;

  @ApiProperty({ description: 'Quién autorizó: nombre y rol de quien dio la autorización', example: 'María López, dueña' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  grantedByDescription: string;

  @ApiProperty({ description: 'Cuándo autorizó (ISO 8601, sin futuro)', example: '2026-10-18T15:30:00.000Z' })
  @IsDateString()
  grantedAt: string;

  @ApiProperty({ description: 'Qué autorizó', example: 'Autorizó repuesto adicional de USD 80 por teléfono.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ description: 'Tope opcional autorizado (§18.1)', example: '80.00' })
  @IsOptional()
  @IsMoneyAmount()
  amountCap?: string;
}
