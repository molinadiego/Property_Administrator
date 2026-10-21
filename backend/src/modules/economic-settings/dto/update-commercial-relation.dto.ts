import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsMoneyAmount } from '../../../common/dto/money';
import { EMERGENCY_POLICIES } from './update-economic-settings.dto';
import { EmergencyPolicyValue } from '../spending-rules';

/**
 * Updates a commercial relation (spec etapa-4.md §4.7): label, emergency
 * override and `ended` — the counterparties are immutable (§2.4, matrix
 * #50/#52). Explicit `null` clears the override. Only `owner` (decision 7).
 */
export class UpdateCommercialRelationDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Nombre comercial de la relación',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Override de política de emergencia; null = no sobrescribe (§8.6)',
    enum: EMERGENCY_POLICIES,
  })
  @IsOptional()
  @IsIn(EMERGENCY_POLICIES)
  emergencyPolicy?: EmergencyPolicyValue | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Importe del override (null lo limpia)',
  })
  @IsOptional()
  @IsMoneyAmount()
  emergencyExtraAmount?: string | null;

  @ApiPropertyOptional({ description: 'Finaliza la relación: no admite órdenes nuevas (§2.4)' })
  @IsOptional()
  @IsBoolean()
  ended?: boolean;
}
