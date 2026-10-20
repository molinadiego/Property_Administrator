import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * RFC 7807 problem detail returned by every error response
 * (all-exceptions filter). Documented here so generated API clients can type
 * the error body without hand-written types (frontend AGENTS.md).
 */
export class ProblemDetailDto {
  @ApiProperty({
    description: 'Identificador del tipo de problema (URL RFC 7807)',
    example: 'https://errors.example.com/unauthorized',
  })
  type: string;

  @ApiProperty({ description: 'Título corto del estado HTTP', example: 'Unauthorized' })
  title: string;

  @ApiProperty({ description: 'Código de estado HTTP', example: 401 })
  status: number;

  @ApiProperty({ description: 'Detalle legible para el usuario', example: 'Credenciales inválidas.' })
  detail: string;

  @ApiProperty({ description: 'Ruta de la petición que falló', example: '/api/v1/auth/login' })
  instance: string;

  @ApiPropertyOptional({ description: 'Identificador correlacionable con los logs' })
  requestId?: string;
}
