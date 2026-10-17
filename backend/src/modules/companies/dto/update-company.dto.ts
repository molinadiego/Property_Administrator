import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @ApiProperty({ example: 'Propiedades del Sur SRL' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;
}
