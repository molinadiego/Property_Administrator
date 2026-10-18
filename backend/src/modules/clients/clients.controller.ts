import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';

@ApiTags('clients')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post('companies/:id/clients')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Registra un cliente propio (empresa own_business, §2.3)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Cliente registrado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es negocio propio (403)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email ya registrado (409)' })
  create(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateClientDto,
  ) {
    return this.clientsService.create(access, auth, dto);
  }

  @Get('companies/:id/clients')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Lista de clientes propios' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de clientes' })
  @HttpCode(HttpStatus.OK)
  list(@CurrentCompany() access: CompanyAccess) {
    return this.clientsService.list(access);
  }
}
