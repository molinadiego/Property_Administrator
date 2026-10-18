import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { CostsService } from './costs.service';
import { PutCostItemsDto, SubmitCostReportDto } from './dto/cost-items.dto';

@ApiTags('costs')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class CostsController {
  constructor(private readonly costsService: CostsService) {}

  @Get('companies/:id/assignments/:assignId/cost-report')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'assignId', description: 'Identificador de la asignación' })
  @ApiOperation({ summary: 'Reporte de costos vigente + versiones enviadas (§8.1–§8.3)' })
  @ApiResponse({ status: 200, description: 'Reporte e historial de versiones' })
  @ApiResponse({ status: 404, description: 'Asignación inexistente o ajena (404)' })
  getCostReport(
    @CurrentCompany() access: CompanyAccess,
    @Param('assignId') assignId: string,
  ) {
    return this.costsService.getCostReport(access, assignId);
  }

  @Put('companies/:id/assignments/:assignId/cost-report/items')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'assignId', description: 'Identificador de la asignación' })
  @ApiOperation({ summary: 'Reemplaza los ítems del borrador (put-list, §8.1)' })
  @ApiResponse({ status: 200, description: 'Borrador guardado' })
  @ApiResponse({ status: 403, description: 'No es la empresa asignada (403)' })
  @ApiResponse({ status: 404, description: 'Asignación inexistente o ajena (404)' })
  @ApiResponse({ status: 409, description: 'Versión ya enviada sin corrección abierta (409)' })
  @ApiResponse({ status: 422, description: 'Ítems inválidos (422)' })
  putItems(
    @CurrentCompany() access: CompanyAccess,
    @Param('assignId') assignId: string,
    @Body() dto: PutCostItemsDto,
  ) {
    return this.costsService.putItems(access, assignId, dto);
  }

  @Post('companies/:id/assignments/:assignId/cost-report/submit')
  @UseGuards(CompanyAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'assignId', description: 'Identificador de la asignación' })
  @ApiOperation({ summary: 'Confirma el envío de los costos (acción explícita, §8.1)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Reporte enviado y notificado' })
  @ApiResponse({ status: 403, description: 'No es la empresa asignada o nunca aceptó (403)' })
  @ApiResponse({ status: 404, description: 'Asignación inexistente o ajena (404)' })
  @ApiResponse({ status: 409, description: 'Sin borrador para enviar (409)' })
  @ApiResponse({ status: 422, description: 'Reporte sin ítems (422)' })
  async submit(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('assignId') assignId: string,
    @Body() dto: SubmitCostReportDto,
  ) {
    await this.costsService.submit(access, auth, assignId, dto);
  }

  @Post('companies/:id/assignments/:assignId/cost-report/correct')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'assignId', description: 'Identificador de la asignación' })
  @ApiOperation({ summary: 'Abre una corrección copiando la última versión enviada (§8.2)' })
  @ApiResponse({ status: 201, description: 'Nuevo borrador corregido enlazado a la anterior' })
  @ApiResponse({ status: 403, description: 'No es la empresa asignada (403)' })
  @ApiResponse({ status: 404, description: 'Asignación inexistente o ajena (404)' })
  @ApiResponse({ status: 409, description: 'Sin versión enviada o borrador ya abierto (409)' })
  correct(
    @CurrentCompany() access: CompanyAccess,
    @Param('assignId') assignId: string,
  ) {
    return this.costsService.correct(access, assignId);
  }
}
