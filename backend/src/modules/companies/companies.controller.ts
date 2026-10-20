import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { CompaniesService } from './companies.service';
import { MembershipsService } from '../memberships/memberships.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto';
import {
  ChangeMemberRoleResponseDto,
  CompanyCreatedDto,
  CompanyMemberDto,
} from './dto/companies-responses.dto';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly membershipsService: MembershipsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crea un espacio; el creador queda como owner' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Espacio creado', type: CompanyCreatedDto })
  create(@CurrentUser() auth: AuthContext, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(auth, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Espacios del usuario (membresías activas)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de espacios con rol' })
  listMine(@CurrentUser() auth: AuthContext) {
    return this.companiesService.listMine(auth);
  }

  @Get(':id')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
  @ApiOperation({ summary: 'Detalle del espacio (miembro activo)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Detalle' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Inexistente o no eres miembro (404)' })
  getDetail(@Param('id') id: string, @CurrentCompany() access: CompanyAccess) {
    return this.companiesService.getDetail(id, access);
  }

  @Patch(':id')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
  @ApiOperation({ summary: 'Edita el nombre del espacio (owner)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Actualizado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Rol insuficiente (403)' })
  update(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(access, auth, dto);
  }

  @Get(':id/members')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
  @ApiOperation({ summary: 'Miembros activos del espacio con rol' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de miembros', type: [CompanyMemberDto] })
  listMembers(@CurrentCompany() access: CompanyAccess) {
    return this.membershipsService.listActive(access.companyId);
  }

  @Patch(':id/members/:membershipId')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
  @ApiOperation({ summary: 'Cambia el rol de un miembro (owner)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Rol actualizado', type: ChangeMemberRoleResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Intento sobre la última owner (409)' })
  changeMemberRole(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('membershipId') membershipId: string,
    @Body() dto: ChangeMemberRoleDto,
  ) {
    return this.membershipsService.changeRole(
      access.companyId,
      membershipId,
      dto.role,
      auth.userId,
    );
  }

  @Delete(':id/members/:membershipId')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoca el acceso de un miembro (no borra su cuenta)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Acceso revocado' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Miembro inexistente (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Intento sobre la última owner (409)' })
  async revokeMember(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('membershipId') membershipId: string,
  ) {
    await this.membershipsService.revoke(access.companyId, membershipId, auth.userId);
  }
}
