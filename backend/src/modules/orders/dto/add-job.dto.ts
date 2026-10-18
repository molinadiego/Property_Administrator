import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Adds a job to a compound order (spec etapa-2 §5.5). */
export class AddJobDto {
  @ApiProperty({ example: 'Reemplazar triturador' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @ApiProperty({ example: 'El triturador está quemado; reemplazar por equivalente.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;
}
