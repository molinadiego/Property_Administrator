import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { EconomicSettingsService } from './economic-settings.service';
import { UpdateEconomicSettingsDto } from './dto/update-economic-settings.dto';
import { CreateCommercialRelationDto } from './dto/create-commercial-relation.dto';
import { UpdateCommercialRelationDto } from './dto/update-commercial-relation.dto';
import { UpdateOrderEconomicPolicyDto } from './dto/update-order-economic-policy.dto';

@ApiTags('economic-settings')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class EconomicSettingsController {
  constructor(private readonly economicSettingsService: EconomicSettingsService) {}

  // -------------------------------------------------------------------------
  // §4.1 Política económica general (§8.4, §8.6)
  // -------------------------------------------------------------------------

  @Get('companies/:id/economic-settings')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Lee la política económica general de la empresa (§8.4, §8.6)' })
  @ApiResponse({ status: 200, description: 'Política general' })
  getSettings(@CurrentCompany() access: CompanyAccess) {
    return this.economicSettingsService.getSettings(access);
  }

  @Patch('companies/:id/economic-settings')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiOperation({ summary: 'Actualiza la política económica general (solo rol owner, decisión 7)' })
  @ApiResponse({ status: 200, description: 'Política actualizada' })
  @ApiResponse({ status: 403, description: 'Rol sin permiso (403)' })
  @ApiResponse({ status: 422, description: 'Datos inválidos (422)' })
  updateSettings(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: UpdateEconomicSettingsDto,
  ) {
    return this.economicSettingsService.updateSettings(access, auth, dto);
  }

  // -------------------------------------------------------------------------
  // §4.7 Relaciones comerciales (§8.6, decisión 4)
  // -------------------------------------------------------------------------

  @Get('companies/:id/commercial-relations')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Relaciones comerciales de la empresa con su override (§8.6)' })
  @ApiResponse({ status: 200, description: 'Lista de relaciones' })
  listRelations(@CurrentCompany() access: CompanyAccess) {
    return this.economicSettingsService.listRelations(access);
  }

  @Post('companies/:id/commercial-relations')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiOperation({ summary: 'Crea una relación comercial con su contraparte (§8.6, decisión 4)' })
  @ApiResponse({ status: 201, description: 'Relación creada' })
  @ApiResponse({ status: 403, description: 'Rol sin permiso (403)' })
  @ApiResponse({ status: 404, description: 'Contraparte inexistente (404)' })
  @ApiResponse({ status: 409, description: 'Relación duplicada (409)' })
  @ApiResponse({ status: 422, description: 'Contraparte inválida (422)' })
  createRelation(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateCommercialRelationDto,
  ) {
    return this.economicSettingsService.createRelation(access, auth, dto);
  }

  @Patch('companies/:id/commercial-relations/:relationId')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiParam({ name: 'relationId', description: 'Identificador de la relación' })
  @ApiOperation({ summary: 'Edita override/etiqueta o finaliza una relación (§2.4, §4.7)' })
  @ApiResponse({ status: 200, description: 'Relación actualizada' })
  @ApiResponse({ status: 403, description: 'Rol sin permiso (403)' })
  @ApiResponse({ status: 404, description: 'Relación inexistente o ajena (404)' })
  @ApiResponse({ status: 422, description: 'Datos inválidos (422)' })
  updateRelation(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('relationId') relationId: string,
    @Body() dto: UpdateCommercialRelationDto,
  ) {
    return this.economicSettingsService.updateRelation(access, auth, relationId, dto);
  }

  // -------------------------------------------------------------------------
  // §4.2 Política económica de la orden (§8.4–§8.6)
  // -------------------------------------------------------------------------

  @Get('companies/:id/orders/:orderId/economic-policy')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Límite, margen (solo originadora) y política de emergencia vigente' })
  @ApiResponse({ status: 200, description: 'Política de la orden' })
  @ApiResponse({ status: 404, description: 'Orden inexistente o ajena (404)' })
  getOrderPolicy(
    @CurrentCompany() access: CompanyAccess,
    @Param('orderId') orderId: string,
  ) {
    return this.economicSettingsService.getOrderPolicy(access, orderId);
  }

  @Patch('companies/:id/orders/:orderId/economic-policy')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Fija límite, margen y relación comercial de la orden (§8.4–§8.6)' })
  @ApiResponse({ status: 200, description: 'Política actualizada' })
  @ApiResponse({ status: 403, description: 'Empresa no originadora (403)' })
  @ApiResponse({ status: 404, description: 'Orden o relación inexistente (404)' })
  @ApiResponse({ status: 422, description: 'Márgenes o importes inválidos (422)' })
  updateOrderPolicy(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderEconomicPolicyDto,
  ) {
    return this.economicSettingsService.updateOrderPolicy(access, auth, orderId, dto);
  }
}
