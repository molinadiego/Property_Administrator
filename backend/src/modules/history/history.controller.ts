import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { CreateShareDto } from './dto/create-share.dto';
import {
  CreatedShareViewDto,
  ManagedOrderListViewDto,
  PropertyHistoryViewDto,
} from './dto/history-responses.dto';
import { HistoryService } from './history.service';

@ApiTags('history')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller('companies/:id/history')
@UseGuards(CompanyAccessGuard)
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('properties/:propId')
  @ApiParam({ name: 'propId', description: 'Identificador de la propiedad' })
  @ApiOperation({ summary: 'Historial de la propiedad: completo, compartido o solo tus trabajos (§7.2)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Historial con órdenes, jobs y archivos visibles', type: PropertyHistoryViewDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Propiedad inexistente o sin acceso (404)' })
  propertyHistory(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('propId') propId: string,
  ) {
    return this.historyService.propertyHistory(access, auth, propId);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Órdenes gestionadas por el espacio: propias y de las que tuvo asignación (§7.3)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Órdenes con jobs y resultados, incl. cerradas', type: ManagedOrderListViewDto })
  managedOrders(@CurrentCompany() access: CompanyAccess) {
    return this.historyService.managedOrders(access);
  }

  @Post('shares')
  @ApiOperation({ summary: 'Comparte los antecedentes de una propiedad a una membresía (§7.5)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Share creado', type: CreatedShareViewDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es dueña de los antecedentes (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Propiedad o membresía inexistente (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Share activo duplicado (409)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Membresía destino inactiva (422)' })
  createShare(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateShareDto,
  ) {
    return this.historyService.createShare(access, auth, dto);
  }

  @Delete('shares/:shareId')
  @ApiParam({ name: 'shareId', description: 'Identificador del share' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoca el share (§7.5): el ex-beneficiario pierde acceso de inmediato (§16.6)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Share revocado' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Share inexistente o de otra empresa (404)' })
  async revokeShare(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('shareId') shareId: string,
  ): Promise<void> {
    await this.historyService.revokeShare(access, auth, shareId);
  }
}
