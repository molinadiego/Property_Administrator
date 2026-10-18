import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanyType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyAccess } from '../../common/request-context';

/**
 * Subscription plans (spec etapa-6.md §4.4, §15, §18.3, D3/D4).
 *
 * Read-only inside the app: there is no platform-admin role, so plan
 * prices are adjusted by seed/deploy, not through an endpoint. A company
 * without an explicit `planId` resolves to the plan of its category;
 * `own_business` maps to the professional plan (§15 has three categories).
 * Nothing is enforced — no usage limits, no feature gates, and billing
 * stays outside the system (§18.3).
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans() {
    const plans = await this.prisma.plan.findMany({ orderBy: { price: 'asc' } });
    return { data: plans.map((plan) => this.serialize(plan)) };
  }

  async getCompanySubscription(access: CompanyAccess) {
    const company = await this.prisma.company.findUnique({
      where: { id: access.companyId },
      select: { id: true, type: true, planId: true },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    const plan = company.planId
      ? await this.prisma.plan.findUnique({ where: { id: company.planId } })
      : await this.prisma.plan.findUnique({ where: { category: this.categoryFor(company.type) } });
    if (!plan) throw new NotFoundException('Plan no encontrado.');

    return {
      ...this.serialize(plan),
      source: company.planId ? ('explicit' as const) : ('category' as const),
    };
  }

  /** D3: `own_business` pays the professional plan (§15, three categories). */
  private categoryFor(type: CompanyType): 'profesional' | 'contractor' | 'property_management' {
    if (type === 'property_management') return 'property_management';
    if (type === 'contractor') return 'contractor';
    return 'profesional';
  }

  private serialize(plan: {
    id: string;
    name: string;
    category: string;
    price: { toFixed: (dp?: number) => string };
    currency: string;
  }) {
    return {
      id: plan.id,
      name: plan.name,
      category: plan.category,
      // Fixed 2-decimal money format (§11): 33.00, never 33.
      price: plan.price.toFixed(2),
      currency: plan.currency,
    };
  }
}
