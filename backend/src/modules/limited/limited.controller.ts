import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentLimited } from '../../common/decorators/current-limited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { LimitedAccess, LimitedAccessGuard } from '../../common/guards/limited-access.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { LimitedAccessService } from './limited.service';
import { CreateRequestDto } from './dto/create-request.dto';

@ApiTags('limited-access')
@Controller()
export class LimitedController {
  constructor(private readonly limitedService: LimitedAccessService) {}

  @Public()
  @UseGuards(LimitedAccessGuard)
  @Get('limited/:token/orders')
  @ApiParam({ name: 'token', description: 'Token opaco de acceso limitado' })
  @ApiOperation({ summary: 'Órdenes de la vivienda/relación, solo estado (§4.3)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Órdenes visibles para la cuenta limitada' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token inválido, revocado o expirado (401)' })
  listOrders(@CurrentLimited() limited: LimitedAccess) {
    return this.limitedService.listOrders(limited.tenantId);
  }

  @Public()
  @UseGuards(LimitedAccessGuard)
  @Post('limited/:token/requests')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'token', description: 'Token opaco de acceso limitado' })
  @ApiOperation({ summary: 'Pide un trabajo; se crea una orden requested (§5.1)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Pedido registrado (status requested)' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token inválido, revocado o expirado (401)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Propiedad inexistente (404)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Sin propiedad referenciada (422)' })
  createRequest(@CurrentLimited() limited: LimitedAccess, @Body() dto: CreateRequestDto) {
    return this.limitedService.createRequest(limited.tenantId, dto);
  }

  @UseGuards(CompanyAccessGuard)
  @Post('companies/:id/orders/:orderId/convert')
  @ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden requested' })
  @ApiOperation({ summary: 'Convierte un pedido requested en orden real (§5.1, AC-4.5)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Orden convertida (open)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente (404)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'No está requested (422)' })
  convert(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
  ) {
    return this.limitedService.convertRequest(access.companyId, orderId, auth.userId);
  }
}
