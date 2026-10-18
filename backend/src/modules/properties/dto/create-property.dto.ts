import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PropertyOccupancy } from '../../../generated/prisma/enums';

/** Creates a property ficha. address_line/city/state are the only required
 * fields (spec etapa-2 §2.2: §5.1 allows a minimal ficha). */
export class CreatePropertyDto {
  @ApiProperty({ example: '123 Sunset Ave' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  addressLine: string;

  @ApiProperty({ example: 'Miami' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city: string;

  @ApiProperty({ example: 'FL' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  state: string;

  @ApiPropertyOptional({ example: '33101' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ enum: PropertyOccupancy, default: PropertyOccupancy.vacant })
  @IsOptional()
  @IsEnum(PropertyOccupancy)
  occupancy?: PropertyOccupancy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ownerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  ownerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ownerPostalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  communityName?: string;

  @ApiPropertyOptional({ description: 'Código de acceso a la comunidad (restringido)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  communityAccessCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  entryInstructions?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowUnattendedEntry?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  petsInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  otherInstructions?: string;
}
