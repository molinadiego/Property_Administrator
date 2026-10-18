import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { IsMoneyAmount } from '../../../common/dto/money';

/**
 * Economic policy of one order (spec etapa-4.md §4.2, §8.4–§8.6): spending
 * limit, commercial margin (private to the originating company, §8.5) and
 * the governing commercial relation (§8.6). Explicit `null` clears a value.
 * Any active member of the owning (originating) company may apply it.
 */
export class UpdateOrderEconomicPolicyDto {
  @ApiPropertyOptional({
    description: 'Límite de gasto de la orden; null = «sin límite económico» (§8.4)',
    example: '250.00',
  })
  @IsOptional()
  @IsMoneyAmount()
  spendingLimit?: string | null;

  @ApiPropertyOptional({ description: 'Activa el margen comercial (≤ 20 %, §8.5)' })
  @IsOptional()
  @IsBoolean()
  marginEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Porcentaje de margen (0–20); null lo limpia (§8.5)', example: '20' })
  @IsOptional()
  @IsMoneyAmount()
  marginPercent?: string | null;

  @ApiPropertyOptional({
    description: 'Relación comercial que gobierna la orden (§8.6); null la desvincula',
  })
  @IsOptional()
  @IsUUID()
  commercialRelationId?: string | null;
}
