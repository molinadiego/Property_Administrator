import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Creates an order bound to a property (spec etapa-2 §5.1: a property is
 * mandatory). The first job mirrors title/description; more jobs can be added
 * to compound orders (§5.5). */
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
}
