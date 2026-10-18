import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Assigns a job to a professional/contractor membership (spec §5.6). */
export class CreateAssignmentDto {
  @ApiProperty({ description: 'Trabajo a asignar' })
  @IsUUID()
  jobId: string;

  @ApiProperty({ description: 'Membresía del asignado (rol activo)' })
  @IsUUID()
  assigneeMembershipId: string;
}

/** Rejecting an assignment may carry a reason (spec §5.6). */
export class RejectAssignmentDto {
  @ApiPropertyOptional({ example: 'No tengo disponibilidad esta semana.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
