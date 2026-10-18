import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsMoneyAmount } from '../../../common/dto/money';
import { EMERGENCY_POLICIES } from './update-economic-settings.dto';
import { EmergencyPolicyValue } from '../spending-rules';

/**
 * Creates a commercial relation governed by the calling company (spec
 * etapa-4.md §4.7, §8.6, decision 4): exactly one counterparty — a company
 * or an own-client relationship. Only the `owner` role (decision 7).
 */
export class CreateCommercialRelationDto {
  @ApiPropertyOptional({ description: 'Contraparte empresa (exclusivo con clientRelationshipId)' })
  @IsOptional()
  @IsUUID()
  counterpartyCompanyId?: string;

  @ApiPropertyOptional({ description: 'Cliente propio (exclusivo con counterpartyCompanyId)' })
  @IsOptional()
  @IsUUID()
  clientRelationshipId?: string;

  @ApiPropertyOptional({ description: 'Nombre comercial de la relación', example: 'Contratista Norte' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ description: 'Override de política de emergencia (§8.6)', enum: EMERGENCY_POLICIES })
  @IsOptional()
  @IsIn(EMERGENCY_POLICIES)
  emergencyPolicy?: EmergencyPolicyValue;

  @ApiPropertyOptional({
    description: 'Importe del override cuando la política es emergency_amount',
    example: '300.00',
  })
  @IsOptional()
  @IsMoneyAmount()
  emergencyExtraAmount?: string;
}
