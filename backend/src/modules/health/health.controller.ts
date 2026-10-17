import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Comprobación de vida y conexión a la base de datos' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Servicio y base de datos disponibles',
    schema: {
      example: {
        status: 'ok',
        database: 'up',
        timestamp: '2026-10-17T15:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Base de datos no disponible (respuesta problem+json)',
  })
  check(): ReturnType<HealthService['check']> {
    return this.healthService.check();
  }
}
