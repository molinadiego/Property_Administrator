import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/** Company response window for urgent orders (spec etapa-6.md §4.2, §18.4). */
export class UpdateUrgencySettingsDto {
  @ApiProperty({ example: 24, description: 'Horas de plazo de respuesta (1–720)' })
  @IsInt()
  @Min(1)
  @Max(720)
  responseHours: number;
}
