import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Shares a property's antecedents with a concrete membership (spec §4.6, §7.5). */
export class CreateShareDto {
  @ApiProperty({ description: 'Propiedad cuyos antecedentes se comparten' })
  @IsUUID()
  propertyId: string;

  @ApiProperty({ description: 'Membresía beneficiaria (rol activo)' })
  @IsUUID()
  sharedWithMembershipId: string;

  @ApiPropertyOptional({ description: 'Motivo / antecedentes relevantes (§7.5)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
