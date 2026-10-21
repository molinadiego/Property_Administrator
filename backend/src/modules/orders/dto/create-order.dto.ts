import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsMoneyAmount } from '../../../common/dto/money';

/** Creates an order bound to a property (spec etapa-2 §5.1: a property is
 * mandatory). The first job mirrors title/description; more jobs can be added
 * to compound orders (§5.5). Etapa 4 adds the economic policy fields (spec
 * etapa-4 §4.2, §8.4–§8.6). */
export class CreateOrderDto {
  @ApiProperty({ description: 'Propiedad vinculada (obligatoria, §5.1)' })
  @IsUUID()
  propertyId: string;

  @ApiProperty({ example: 'Revisar triturador de basura' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @ApiProperty({ example: 'No tritura, hace ruido pero no muele.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @ApiPropertyOptional({ description: 'Cliente propio (solo empresas own_business)' })
  @IsOptional()
  @IsUUID()
  clientRelationshipId?: string;

  @ApiPropertyOptional({ description: 'Lockbox de la visita (vive en la orden, §5.8)' })
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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Límite de gasto de la orden; null explícito = «sin límite» (§8.4)',
    example: '250.00',
  })
  @IsOptional()
  @IsMoneyAmount()
  spendingLimit?: string | null;

  @ApiPropertyOptional({
    description: 'Aplica el límite general de la empresa si no se envía uno (default true, §8.4)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  applyCompanyDefault?: boolean;

  @ApiPropertyOptional({ description: 'Activa el margen comercial de la orden (§8.5)' })
  @IsOptional()
  @IsBoolean()
  marginEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Porcentaje de margen (0–20, §8.5)', example: '20' })
  @IsOptional()
  @IsMoneyAmount()
  marginPercent?: string;

  @ApiPropertyOptional({
    description: 'Relación comercial que gobierna la emergencia de la orden (§8.6, decisión 4)',
  })
  @IsOptional()
  @IsUUID()
  commercialRelationId?: string;
}
