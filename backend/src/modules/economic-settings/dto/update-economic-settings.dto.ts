import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { IsMoneyAmount } from '../../../common/dto/money';
import { EmergencyPolicyValue } from '../spending-rules';

export const EMERGENCY_POLICIES = [
  'prior_authorization',
  'resolve_without_authorization',
  'emergency_amount',
] as const satisfies readonly EmergencyPolicyValue[];

/**
 * General economic policy of a company (spec etapa-4.md §4.1, §8.4, §8.6).
 * Only the `owner` role applies it (decision 7). Explicit `null` clears a
 * value (`defaultSpendingLimit` null = «sin límite»).
 */
export class UpdateEconomicSettingsDto {
  @ApiPropertyOptional({
    description: 'Límite general de gasto; null = «sin límite económico» (§8.4)',
    example: '250.00',
  })
  @IsOptional()
  @IsMoneyAmount()
  defaultSpendingLimit?: string | null;

  @ApiPropertyOptional({ description: 'Política general de emergencia (§8.6)', enum: EMERGENCY_POLICIES })
  @IsOptional()
  @IsIn(EMERGENCY_POLICIES)
  emergencyPolicy?: EmergencyPolicyValue;

  @ApiPropertyOptional({
    description: 'Importe adicional pre-autorizado para la política emergency_amount (§8.6)',
    example: '150.00',
  })
  @IsOptional()
  @IsMoneyAmount()
  emergencyExtraAmount?: string | null;
}
