import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token enviado por email (no se almacena en claro)' })
  @IsString()
  @MaxLength(500)
  token: string;

  @ApiProperty({ minLength: 8, example: 'nueva-contraseña-segura' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
}
