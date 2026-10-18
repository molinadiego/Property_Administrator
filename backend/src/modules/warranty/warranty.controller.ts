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
import { WarrantyService } from './warranty.service';
import { CreateWarrantyClaimDto } from './dto/create-warranty-claim.dto';
import { ResolveWarrantyClaimDto } from './dto/resolve-warranty-claim.dto';

@ApiTags('warranty')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class WarrantyController {
  constructor(private readonly warrantyService: WarrantyService) {}

  @Post('companies/:id/orders/:orderId/warranty-claims')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden original' })
  @ApiOperation({ summary: 'Crea un reclamo de garantía sobre un trabajo Completado (§13)' })
  @ApiResponse({ status: 201, description: 'Reclamo creado (open)' })
  @ApiResponse({ status: 401, description: 'Sin sesión (401)' })
  @ApiResponse({ status: 404, description: 'Orden o trabajo inexistente/ajeno (404)' })
  @ApiResponse({ status: 422, description: 'Trabajo no Completado o body inválido (422)' })
  create(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: CreateWarrantyClaimDto,
  ) {
    return this.warrantyService.create(access, auth, orderId, dto);
  }

  @Get('companies/:id/orders/:orderId/warranty-claims')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden original' })
  @ApiOperation({ summary: 'Reclamos de garantía de una orden propia (§13)' })
  @ApiResponse({ status: 200, description: 'Lista de reclamos' })
  @ApiResponse({ status: 404, description: 'Orden inexistente o ajena (404)' })
  list(@CurrentCompany() access: CompanyAccess, @Param('orderId') orderId: string) {
    return this.warrantyService.list(access, orderId);
  }

  @Get('companies/:id/warranty-claims/:claimId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'claimId', description: 'Identificador del reclamo' })
  @ApiOperation({ summary: 'Detalle del reclamo con el contexto de la reparación original (§13)' })
  @ApiResponse({ status: 200, description: 'Detalle del reclamo' })
  @ApiResponse({ status: 404, description: 'Reclamo inexistente o ajeno (404)' })
  getDetail(@CurrentCompany() access: CompanyAccess, @Param('claimId') claimId: string) {
    return this.warrantyService.getDetail(access, claimId);
  }

  @Post('companies/:id/warranty-claims/:claimId/resolve')
  @UseGuards(CompanyAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'claimId', description: 'Identificador del reclamo' })
  @ApiOperation({ summary: 'Resuelve un reclamo abierto con su resolución (§13)' })
  @ApiResponse({ status: 200, description: 'Reclamo resuelto' })
  @ApiResponse({ status: 401, description: 'Sin sesión (401)' })
  @ApiResponse({ status: 404, description: 'Reclamo inexistente o ajeno (404)' })
  @ApiResponse({ status: 409, description: 'Reclamo ya resuelto (409)' })
  @ApiResponse({ status: 422, description: 'Resolución vacía o inválida (422)' })
  resolve(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('claimId') claimId: string,
    @Body() dto: ResolveWarrantyClaimDto,
  ) {
    return this.warrantyService.resolve(access, auth, claimId, dto);
  }
}
