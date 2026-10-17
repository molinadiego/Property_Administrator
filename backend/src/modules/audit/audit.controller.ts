import { Controller, Get, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log.query.dto';

@ApiTags('audit-log')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller('companies/:id/audit-log')
@UseGuards(CompanyAccessGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Historial de acciones del espacio (solo lectura, paginado por cursor)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Eventos ordenados por created_at descendente',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Espacio inexistente o no eres miembro' })
  list(
    @Param('id') companyId: string,
    @Query() query: AuditLogQueryDto,
  ): ReturnType<AuditService['listCompanyEntries']> {
    return this.auditService.listCompanyEntries(companyId, query);
  }
}
