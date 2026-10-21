import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsTaxRate } from '../../../common/dto/tax-rate';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Propiedades del Sur SRL' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Identificación fiscal del emisor (etapa-7.md §2.1, §11.6); cadena vacía la borra',
    example: 'NV1234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxId?: string;

  @ApiPropertyOptional({ description: 'Dirección fiscal (se muestra en el PDF); cadena vacía la borra' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  taxAddress?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tasa de impuesto por defecto en % (0–100, ≤ 3 decimales); null la borra',
    example: '8.375',
  })
  @IsOptional()
  @IsTaxRate()
  defaultTaxRate?: string | null;

  @ApiPropertyOptional({ description: 'Empresa exenta: el impuesto se congela en 0.00 (etapa-7.md D2)' })
  @IsOptional()
  @IsBoolean()
  taxExempt?: boolean;
}
