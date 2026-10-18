import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Creates a warranty claim over a completed job of the company's own order
 * (spec etapa-6.md §4.1, §13; originating company only, D5).
 */
export class CreateWarrantyClaimDto {
  @ApiProperty({
    example: 'La reparación de la filtración volvió a aparecer una semana después.',
    description: 'Trabajo reparado objeto del reclamo (debe estar en estado Completado).',
  })
  @IsUUID()
  jobId: string;

  @ApiProperty({
    example: 'La filtración bajo el lavamanos reapareció con el uso normal.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;
}
