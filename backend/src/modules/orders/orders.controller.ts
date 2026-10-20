import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { AddJobDto } from './dto/add-job.dto';
import { OrdersQueryDto } from './dto/orders.query.dto';
import { OrderViewDto } from './dto/orders-responses.dto';
import { CreateAssignmentDto, RejectAssignmentDto } from './dto/create-assignment.dto';
import {
  CancelOrderDto,
  CompleteJobDto,
  JobIncompleteDto,
  JobProgressDto,
  NotRealizedDto,
} from './dto/job-action.dto';

@ApiTags('orders')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('companies/:id/orders')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Crea una orden vinculada a una propiedad (§5.1)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Orden creada con su primer trabajo' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Espacio o propiedad inexistente (404)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Datos inválidos (422)' })
  create(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(access, auth, dto);
  }

  @Get('companies/:id/orders')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Órdenes del espacio y las asignadas al usuario, con filtros opcionales (§2.12, BE-1)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de órdenes', type: [OrderViewDto] })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Filtro de consulta inválido (422)' })
  list(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Query() query: OrdersQueryDto,
  ) {
    return this.ordersService.list(access, auth, query);
  }

  @Get('companies/:id/orders/:orderId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Detalle de la orden; el profesional ve solo sus trabajos (§2.3)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Detalle' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente o ajena (404)' })
  getDetail(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.getDetail(access, auth, orderId);
  }

  @Patch('companies/:id/orders/:orderId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Edita instrucciones/acceso de la orden gestionada (§4.4, §5.8)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Orden actualizada' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No la gestiona este espacio (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente o ajena (404)' })
  update(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(access, auth, orderId, dto);
  }

  @Post('companies/:id/orders/:orderId/jobs')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Agrega un trabajo a una orden compuesta (§5.5)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Trabajo agregado' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente o ajena (404)' })
  addJob(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: AddJobDto,
  ) {
    return this.ordersService.addJob(access, auth, orderId, dto);
  }

  @Post('companies/:id/orders/:orderId/assignments')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Asigna un trabajo a un contratista o profesional (§5.6)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Asignación creada (pending)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ya tiene asignación activa (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden, trabajo o asignado inexistente (404)' })
  assign(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.ordersService.assign(access, auth, orderId, dto);
  }

  @Post('companies/:id/assignments/:assignId/accept')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'assignId', description: 'Identificador de la asignación' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Acepta la asignación (§5.6, solo el asignado)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aceptada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ya respondida (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Asignación inexistente o ajena (404)' })
  async accept(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('assignId') assignId: string,
  ) {
    await this.ordersService.accept(access, auth, assignId);
  }

  @Post('companies/:id/assignments/:assignId/reject')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'assignId', description: 'Identificador de la asignación' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rechaza la asignación; el trabajo queda pending (§5.6)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ya respondida (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Asignación inexistente o ajena (404)' })
  async reject(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('assignId') assignId: string,
    @Body() dto: RejectAssignmentDto,
  ) {
    await this.ordersService.reject(access, auth, assignId, dto);
  }

  @Post('companies/:id/assignments/:assignId/reassign')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'assignId', description: 'Identificador de la asignación previa' })
  @ApiOperation({ summary: 'Reasigna el trabajo conservando el historial (§5.7)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Nueva asignación creada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Trabajo en curso u otra restricción de estado (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Asignación o asignado inexistente (404)' })
  reassign(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('assignId') assignId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.ordersService.reassign(access, auth, assignId, dto);
  }

  // -------------------------------------------------------------------------
  // Etapa 3: seguimiento del profesional (docs/especificacion/etapa-3.md §4.1)
  // -------------------------------------------------------------------------

  @Post('companies/:id/jobs/:jobId/start')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'jobId', description: 'Identificador del trabajo' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Comienza el trabajo: accepted → in_progress (§6.1, §20.2)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Trabajo iniciado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es tu trabajo (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Trabajo inexistente o fuera de alcance (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Estado que no permite iniciar (409)' })
  async startJob(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('jobId') jobId: string,
  ) {
    await this.ordersService.startJob(access, auth, jobId);
  }

  @Post('companies/:id/jobs/:jobId/progress')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'jobId', description: 'Identificador del trabajo' })
  @ApiOperation({ summary: 'Registra un avance del trabajo (§6.1)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Avance registrado en job_events' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es tu trabajo (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Trabajo inexistente o fuera de alcance (404)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Mensaje vacío o inválido (422)' })
  recordProgress(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: JobProgressDto,
  ) {
    return this.ordersService.recordProgress(access, auth, jobId, dto);
  }

  @Post('companies/:id/jobs/:jobId/complete')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'jobId', description: 'Identificador del trabajo' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marca el trabajo como terminado: in_progress → done (§6.1)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Trabajo terminado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es tu trabajo (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Trabajo inexistente o fuera de alcance (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Solo un trabajo en curso puede completarse (409)' })
  async completeJob(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: CompleteJobDto,
  ) {
    await this.ordersService.completeJob(access, auth, jobId, dto);
  }

  @Post('companies/:id/jobs/:jobId/incomplete')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'jobId', description: 'Identificador del trabajo' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Informa que no pudo terminar: in_progress → incomplete (§6.2)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Trabajo incompleto registrado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es tu trabajo (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Trabajo inexistente o fuera de alcance (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Estado que no permite informar incompletud (409)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Motivo obligatorio (422)' })
  async reportIncomplete(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: JobIncompleteDto,
  ) {
    await this.ordersService.reportIncomplete(access, auth, jobId, dto);
  }

  // -------------------------------------------------------------------------
  // Etapa 3: decisiones del responsable (spec §4.2)
  // -------------------------------------------------------------------------

  @Post('companies/:id/jobs/:jobId/resume')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'jobId', description: 'Identificador del trabajo' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Autoriza continuar con el mismo profesional: incomplete → in_progress (§6.2, §20.2)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Trabajo reanudado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Empresa no responsable (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Trabajo inexistente o sin relación (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Estado o asignación que no lo permite (409)' })
  async resumeJob(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('jobId') jobId: string,
  ) {
    await this.ordersService.resumeJob(access, auth, jobId);
  }

  @Post('companies/:id/jobs/:jobId/not-realized')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'jobId', description: 'Identificador del trabajo' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registra «No pudo concretarse» con motivo (§6.3)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Trabajo no realizado registrado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Empresa no responsable (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Trabajo inexistente o sin relación (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Trabajo ya finalizado (409)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Motivo obligatorio (422)' })
  async notRealizeJob(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: NotRealizedDto,
  ) {
    await this.ordersService.notRealizeJob(access, auth, jobId, dto);
  }

  @Post('companies/:id/assignments/:assignId/revoke')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'assignId', description: 'Identificador de la asignación' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoca una asignación activa; el job no iniciado vuelve a pending (§20.3)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Asignación revocada' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Empresa no responsable (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Asignación inexistente o sin relación (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Asignación inactiva o trabajo en curso (409)' })
  async revokeAssignment(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('assignId') assignId: string,
  ) {
    await this.ordersService.revokeAssignment(access, auth, assignId);
  }

  // -------------------------------------------------------------------------
  // Etapa 3: cierre y cancelación de la orden (spec §4.3)
  // -------------------------------------------------------------------------

  @Post('companies/:id/orders/:orderId/close')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cierra la orden con todos los trabajos terminales (§6.4)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Orden cerrada' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Empresa no originadora (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente o sin relación (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Trabajos sin finalizar o orden ya cerrada (409)' })
  async closeOrder(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
  ) {
    await this.ordersService.closeOrder(access, auth, orderId);
  }

  @Post('companies/:id/orders/:orderId/cancel')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancela la orden completa con motivo, sin trabajo realizado (§20.1)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Orden cancelada' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Empresa no responsable (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente o sin relación (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Trabajo realizado o estado no cancelable (409)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Motivo obligatorio (422)' })
  async cancelOrder(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    await this.ordersService.cancelOrder(access, auth, orderId, dto);
  }
}
