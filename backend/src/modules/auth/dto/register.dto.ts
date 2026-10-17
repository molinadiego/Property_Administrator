import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Ana García' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  /** Technical default (no policy in proyect.md): 8-200 chars, Argon2id at rest. */
  @ApiProperty({ minLength: 8, example: 'contraseña-segura' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
}
