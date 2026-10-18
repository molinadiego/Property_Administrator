import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyAccess } from '../../common/request-context';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Planes de suscripción (solo lectura, §15, §18.3)' })
  @ApiResponse({ status: 200, description: 'Los tres planes con sus precios' })
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @Get('companies/:id/subscription')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
  @ApiOperation({ summary: 'Plan efectivo de la empresa: explícito o el de su categoría (D3)' })
  @ApiResponse({ status: 200, description: 'Plan vigente de la empresa' })
  @ApiResponse({ status: 404, description: 'Empresa inexistente o ajena (404)' })
  getSubscription(@CurrentCompany() access: CompanyAccess) {
    return this.subscriptions.getCompanySubscription(access);
  }
}
