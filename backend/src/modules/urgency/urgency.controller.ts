import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { UrgencyService } from './urgency.service';
import { UpdateUrgencySettingsDto } from './dto/update-urgency-settings.dto';

@ApiTags('urgency')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class UrgencyController {
  constructor(private readonly urgencyService: UrgencyService) {}

  @Get('companies/:id/urgency-settings')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Plazo de respuesta a órdenes urgentes de la empresa (§14.2, §18.4)' })
  @ApiResponse({ status: 200, description: 'Configuración vigente' })
  getSettings(@CurrentCompany() access: CompanyAccess) {
    return this.urgencyService.getSettings(access);
  }

  @Patch('companies/:id/urgency-settings')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiOperation({ summary: 'Actualiza el plazo de respuesta (solo owner, §18.4)' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada' })
  @ApiResponse({ status: 403, description: 'Rol sin permiso (403)' })
  @ApiResponse({ status: 422, description: 'Plazo fuera de 1–720 o payload inválido (422)' })
  updateSettings(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: UpdateUrgencySettingsDto,
  ) {
    return this.urgencyService.updateSettings(access, auth, dto);
  }
}
