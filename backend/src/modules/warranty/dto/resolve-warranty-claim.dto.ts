import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Resolves an open warranty claim (spec etapa-6.md §4.1, AC-6.4). */
export class ResolveWarrantyClaimDto {
  @ApiProperty({
    example: 'Cobertura reconocida; se emitió una nueva orden para el mismo profesional.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  resolution: string;
}
