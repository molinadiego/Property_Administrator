import {
  Body,
  Controller,
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
import { AuthorizationsService } from './authorizations.service';
import {
  CreateAuthorizationRequestDto,
  ResolveAuthorizationRequestDto,
} from './dto/authorization-request.dto';
import { RecordAuthorizationDto } from './dto/record-authorization.dto';

@ApiTags('authorizations')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class AuthorizationsController {
  constructor(private readonly authorizationsService: AuthorizationsService) {}

  // -------------------------------------------------------------------------
  // §4.4 Solicitudes (§8.4, §9)
  // -------------------------------------------------------------------------

  @Get('companies/:id/orders/:orderId/authorization-requests')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Solicitudes de autorización: la originadora todas, la asignada las suyas' })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes' })
  @ApiResponse({ status: 404, description: 'Orden inexistente o ajena (404)' })
  listRequests(
    @CurrentCompany() access: CompanyAccess,
    @Param('orderId') orderId: string,
  ) {
    return this.authorizationsService.listRequests(access, orderId);
  }

  @Post('companies/:id/orders/:orderId/authorization-requests')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Informa y propone: exceder el límite o trabajo adicional (§9)' })
  @ApiResponse({ status: 201, description: 'Solicitud creada (pending)' })
  @ApiResponse({ status: 403, description: 'Sin asignación activa o empresa originadora (403)' })
  @ApiResponse({ status: 404, description: 'Orden inexistente o ajena (404)' })
  @ApiResponse({ status: 422, description: 'Importe o datos inválidos (422)' })
  createRequest(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: CreateAuthorizationRequestDto,
  ) {
    return this.authorizationsService.createRequest(access, auth, orderId, dto);
  }

  @Post('companies/:id/authorization-requests/:requestId/approve')
  @UseGuards(CompanyAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'requestId', description: 'Identificador de la solicitud' })
  @ApiOperation({ summary: 'Aprueba: crea la constancia; additional_work agrega el job a la orden (§8.4, decisión 5)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobada' })
  @ApiResponse({ status: 403, description: 'Empresa no originadora (403)' })
  @ApiResponse({ status: 404, description: 'Solicitud inexistente o ajena (404)' })
  @ApiResponse({ status: 409, description: 'Ya resuelta u orden finalizada (409)' })
  async approve(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('requestId') requestId: string,
  ) {
    await this.authorizationsService.approve(access, auth, requestId);
  }

  @Post('companies/:id/authorization-requests/:requestId/reject')
  @UseGuards(CompanyAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'requestId', description: 'Identificador de la solicitud' })
  @ApiOperation({ summary: 'Rechaza con nota obligatoria (§9)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazada' })
  @ApiResponse({ status: 403, description: 'Empresa no originadora (403)' })
  @ApiResponse({ status: 404, description: 'Solicitud inexistente o ajena (404)' })
  @ApiResponse({ status: 409, description: 'Ya resuelta (409)' })
  @ApiResponse({ status: 422, description: 'Nota de rechazo ausente (422)' })
  async reject(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('requestId') requestId: string,
    @Body() dto: ResolveAuthorizationRequestDto,
  ) {
    await this.authorizationsService.reject(access, auth, requestId, dto);
  }

  // -------------------------------------------------------------------------
  // §4.5 Constancias (§8.7, §18.1)
  // -------------------------------------------------------------------------

  @Get('companies/:id/orders/:orderId/authorizations')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Constancias de la orden; la asignada ve las que afectan su límite (§16.9)' })
  @ApiResponse({ status: 200, description: 'Lista de constancias' })
  @ApiResponse({ status: 404, description: 'Orden inexistente o ajena (404)' })
  listAuthorizations(
    @CurrentCompany() access: CompanyAccess,
    @Param('orderId') orderId: string,
  ) {
    return this.authorizationsService.listAuthorizations(access, orderId);
  }

  @Post('companies/:id/orders/:orderId/authorizations')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Registra una autorización recibida fuera (teléfono, §18.1)' })
  @ApiResponse({ status: 201, description: 'Constancia registrada' })
  @ApiResponse({ status: 403, description: 'Empresa no originadora (403)' })
  @ApiResponse({ status: 404, description: 'Orden inexistente o ajena (404)' })
  @ApiResponse({ status: 422, description: 'Fecha futura, tope o datos inválidos (422)' })
  recordAuthorization(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: RecordAuthorizationDto,
  ) {
    return this.authorizationsService.recordAuthorization(access, auth, orderId, dto);
  }

  // -------------------------------------------------------------------------
  // §4.6 Resumen económico (§8.4, §8.5, §8.7)
  // -------------------------------------------------------------------------

  @Get('companies/:id/orders/:orderId/economic-summary')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Límite efectivo, techo autorizado, costos enviados y excesos (§8.4–§8.7)' })
  @ApiResponse({ status: 200, description: 'Resumen económico (el margen solo lo ve la originadora)' })
  @ApiResponse({ status: 404, description: 'Orden inexistente o ajena (404)' })
  getEconomicSummary(
    @CurrentCompany() access: CompanyAccess,
    @Param('orderId') orderId: string,
  ) {
    return this.authorizationsService.getEconomicSummary(access, orderId);
  }
}
