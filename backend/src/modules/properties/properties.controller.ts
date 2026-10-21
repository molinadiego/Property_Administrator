import {
  Body,
  Controller,
  Get,
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
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { CreatePropertyTenantDto } from './dto/create-property-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import {
  PropertyDetailViewDto,
  PropertyViewDto,
  TenantAccessResultViewDto,
  TenantUpdateResultViewDto,
} from './dto/properties-responses.dto';

@ApiTags('properties')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post('companies/:id/properties')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Crea la ficha de una propiedad (mínima o completa, §5.1)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Propiedad creada', type: PropertyViewDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es miembro (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Espacio inexistente (404)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Datos inválidos (422)' })
  create(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.propertiesService.create(access, auth, dto);
  }

  @Get('companies/:id/properties')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Lista las propiedades del espacio' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de propiedades', type: [PropertyViewDto] })
  list(@CurrentCompany() access: CompanyAccess) {
    return this.propertiesService.list(access);
  }

  @Get('companies/:id/properties/:propId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'propId', description: 'Identificador de la propiedad' })
  @ApiOperation({ summary: 'Detalle de la propiedad con sus inquilinos' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Detalle', type: PropertyDetailViewDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Propiedad inexistente (404)' })
  getDetail(@CurrentCompany() access: CompanyAccess, @Param('propId') propId: string) {
    return this.propertiesService.getDetail(access, propId);
  }

  @Patch('companies/:id/properties/:propId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'propId', description: 'Identificador de la propiedad' })
  @ApiOperation({ summary: 'Edita los datos oficiales (solo administradora, §4.4)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Actualizada', type: PropertyViewDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es la administradora (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Propiedad inexistente (404)' })
  update(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('propId') propId: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(access, auth, propId, dto);
  }

  @Post('companies/:id/properties/:propId/tenants')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'propId', description: 'Identificador de la propiedad' })
  @ApiOperation({ summary: 'Registra un inquilino o propietario y lo vincula a la propiedad' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tenant creado y vinculado', type: TenantAccessResultViewDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email ya registrado (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Propiedad inexistente (404)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Vacante con inquilino (422)' })
  addTenant(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('propId') propId: string,
    @Body() dto: CreatePropertyTenantDto,
  ) {
    return this.propertiesService.addTenant(access, auth, propId, dto);
  }

  @Patch('companies/:id/tenants/:tenantId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'tenantId', description: 'Identificador del inquilino' })
  @ApiOperation({ summary: 'Edita los datos operativos del inquilino (§4.4)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Actualizado', type: TenantUpdateResultViewDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Inquilino inexistente (404)' })
  updateTenant(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.propertiesService.updateTenant(access, auth, tenantId, dto);
  }
}
