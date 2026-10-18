import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsMoneyAmount } from '../../../common/dto/money';
import { COST_CATEGORIES, COST_ITEM_DESCRIPTION_MAX } from '../cost-rules';

/** One cost line of a report (spec etapa-4.md §2.6, §8.1). */
export class CostItemDto {
  @ApiProperty({ description: 'Concepto del costo (§8.1)', enum: COST_CATEGORIES })
  @IsIn([...COST_CATEGORIES])
  category: (typeof COST_CATEGORIES)[number];

  @ApiProperty({ example: 'Pulgadas de tubería de cobre' })
  @IsString()
  @MinLength(1)
  @MaxLength(COST_ITEM_DESCRIPTION_MAX)
  description: string;

  @ApiProperty({ description: 'Importe en USD con hasta 2 decimales', example: '125.50' })
  @IsMoneyAmount()
  amount: string;

  @ApiPropertyOptional({ description: 'Registrado dentro de una intervención de emergencia (§8.6)' })
  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;
}

/** Replaces the whole draft's items (put-list pattern, spec §4.3). */
export class PutCostItemsDto {
  @ApiProperty({ type: [CostItemDto], description: 'Lista completa de renglones (§8.1)' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CostItemDto)
  items: CostItemDto[];

  @ApiPropertyOptional({ description: 'Notas del emisor sobre el borrador' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Confirms the submission of the draft (§8.1: explicit confirmation). */
export class SubmitCostReportDto {
  @ApiPropertyOptional({ description: 'Notas del emisor al enviar' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
