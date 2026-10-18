import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PropertyTenantKind } from '../../../generated/prisma/enums';

/** Registers a tenant (owner or occupant) on a property (spec §4.3). Tenant
 * data is only required when the property is occupied (§4.3). */
export class CreatePropertyTenantDto {
  @ApiProperty({ enum: PropertyTenantKind, example: PropertyTenantKind.tenant })
  @IsEnum(PropertyTenantKind)
  kind: PropertyTenantKind;

  @ApiProperty({ example: 'Ana López' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ type: [String], example: ['+1 305 555 0101'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(5)
  phones?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ description: 'Franjas horarias disponibles para la visita' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  availability?: string;

  @ApiPropertyOptional({ description: 'Email para entregar el token de acceso limitado' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;
}
