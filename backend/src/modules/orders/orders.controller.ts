import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { CreateAssignmentDto, RejectAssignmentDto } from './dto/create-assignment.dto';

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
  @ApiOperation({ summary: 'Órdenes del espacio y las asignadas al usuario (§2.12)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de órdenes' })
  list(@CurrentCompany() access: CompanyAccess, @CurrentUser() auth: AuthContext) {
    return this.ordersService.list(access, auth);
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
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Asignación o asignado inexistente (404)' })
  reassign(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('assignId') assignId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.ordersService.reassign(access, auth, assignId, dto);
  }
}
