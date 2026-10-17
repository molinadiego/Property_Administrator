import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { CompanyType } from '../../../generated/prisma/enums';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Propiedades del Sur' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: CompanyType, example: CompanyType.property_management })
  @IsEnum(CompanyType)
  type: CompanyType;
}
