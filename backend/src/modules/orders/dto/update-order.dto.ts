import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Edits the instructions/access info of an order the company manages
 * (spec §4.4: the contractor edits the order instructions; §5.8: the access
 * info lives on the order, not on the property). Etapa 6 adds the `urgent`
 * flag (etapa-6.md §4.2, §14.2): only the order's company, while active.
 */
export class UpdateOrderDto {
  @ApiPropertyOptional({ example: 'Revisar triturador de basura' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ example: 'No tritura, hace ruido pero no muele.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Lockbox de la visita (§5.8)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accessLockbox?: string;

  @ApiPropertyOptional({ description: 'Código de comunidad de esta visita (§5.8)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accessCommunityCode?: string;

  @ApiPropertyOptional({ description: 'Instrucciones de entrada de esta visita (§5.8)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessEntryInstructions?: string;

  @ApiPropertyOptional({ description: 'Marca de urgente de la orden (§14.2, etapa 6)' })
  @IsOptional()
  @IsBoolean()
  urgent?: boolean;
}
