import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** A work request from a limited-access account (spec §5.1). */
export class CreateRequestDto {
  @ApiProperty({ example: 'Fuga bajo el lavadero' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @ApiProperty({ example: 'Apenas sale agua, ya está mojando el piso.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @ApiPropertyOptional({ description: 'Propiedad del trabajo (obligatoria para clientes propios)' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}
