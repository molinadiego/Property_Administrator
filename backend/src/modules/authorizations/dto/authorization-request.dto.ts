import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsMoneyAmount } from '../../../common/dto/money';
import { AUTHORIZATION_TYPES } from '../authorization-rules';
import { AuthorizationRequestType } from '../../../generated/prisma/client';

/**
 * Raises an authorization request (spec etapa-4.md §4.4, §8.4, §9): the
 * assignee informs and proposes; only the originating company resolves.
 */
export class CreateAuthorizationRequestDto {
  @ApiProperty({
    description: 'Exceder el límite de gasto o proponer un trabajo adicional (§8.4, §9)',
    enum: AUTHORIZATION_TYPES,
  })
  @IsIn([...AUTHORIZATION_TYPES])
  type: AuthorizationRequestType;

  @ApiProperty({ description: 'Qué se propone y por qué', example: 'La reparación requiere un repuesto de USD 80 adicionales.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({
    description: 'Importe propuesto: tope para exceder, referencia para adicional (§8.4)',
    example: '80.00',
  })
  @IsOptional()
  @IsMoneyAmount()
  requestedAmount?: string;
}

/** Resolves a request; `note` is mandatory when rejecting (§9). */
export class ResolveAuthorizationRequestDto {
  @ApiPropertyOptional({ description: 'Nota de resolución (obligatoria al rechazar, §9)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note?: string;
}
