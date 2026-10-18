import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommercialRelation, Company, Order, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AUDIT_ACTIONS_ETAPA4,
  AUDIT_ENTITIES,
  AUDIT_ENTITIES_ETAPA2,
  AUDIT_ENTITIES_ETAPA4,
} from '../audit/audit-actions';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { UpdateEconomicSettingsDto } from './dto/update-economic-settings.dto';
import { CreateCommercialRelationDto } from './dto/create-commercial-relation.dto';
import { UpdateCommercialRelationDto } from './dto/update-commercial-relation.dto';
import { UpdateOrderEconomicPolicyDto } from './dto/update-order-economic-policy.dto';
import {
  fromCents,
  isValidMarginPercent,
  nullableToCents,
  resolveEmergencyPolicy,
  validateEmergencyAmount,
} from './spending-rules';
import {
  isRelationAttachable,
  relationGovernsCompany,
  validateCounterparty,
} from './relation-rules';

type RelationRow = CommercialRelation & {
  counterpartyCompany?: { id: string; name: string } | null;
  clientRelationship?: { tenant: { id: string; name: string } } | null;
};

/** Prisma Decimal → nullable string safe for the pure rules. */
function decimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString();
}

/**
 * General economic policy, commercial relations and per-order economic policy
 * (spec etapa-4.md §4.1, §4.2, §4.7, §8.4–§8.6).
 *
 * Visibility (§16.8/§16.9): the company settings and its relations belong to
 * the company; the order policy is readable by the owning company (full,
 * margin included) and by the assignee company (limit only — the margin is
 * private to the originator, decision 9). Foreign companies get 404.
 */
@Injectable()
export class EconomicSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // §4.1 Company economic settings (§8.4, §8.6)
  // -------------------------------------------------------------------------

  async getSettings(access: CompanyAccess) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: access.companyId },
    });
    return this.serializeSettings(company);
  }

  async updateSettings(access: CompanyAccess, auth: AuthContext, dto: UpdateEconomicSettingsDto) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: access.companyId },
    });

    const emergencyPolicy = dto.emergencyPolicy ?? company.emergencyPolicy;
    const emergencyExtraAmount =
      dto.emergencyExtraAmount !== undefined
        ? dto.emergencyExtraAmount?.trim() || null
        : decimalString(company.emergencyExtraAmount);
    if (!validateEmergencyAmount(emergencyPolicy, nullableToCents(emergencyExtraAmount))) {
      throw new UnprocessableEntityException(
        'La política emergency_amount requiere un importe adicional positivo (§8.6).',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.company.update({
        where: { id: access.companyId },
        data: {
          ...(dto.defaultSpendingLimit !== undefined
            ? { defaultSpendingLimit: dto.defaultSpendingLimit?.trim() || null }
            : {}),
          ...(dto.emergencyPolicy !== undefined ? { emergencyPolicy: dto.emergencyPolicy } : {}),
          ...(dto.emergencyExtraAmount !== undefined
            ? { emergencyExtraAmount: dto.emergencyExtraAmount?.trim() || null }
            : {}),
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA4.COMPANY_ECONOMIC_SETTINGS_CHANGED,
          entityType: AUDIT_ENTITIES.COMPANY,
          entityId: access.companyId,
          payload: {
            defaultSpendingLimit: decimalString(result.defaultSpendingLimit),
            emergencyPolicy: result.emergencyPolicy,
            emergencyExtraAmount: decimalString(result.emergencyExtraAmount),
          },
        },
        tx,
      );
      return result;
    });
    return this.serializeSettings(updated);
  }

  // -------------------------------------------------------------------------
  // §4.7 Commercial relations (§8.6, decision 4)
  // -------------------------------------------------------------------------

  async listRelations(access: CompanyAccess) {
    const rows = await this.prisma.commercialRelation.findMany({
      where: { companyId: access.companyId },
      include: {
        counterpartyCompany: { select: { id: true, name: true } },
        clientRelationship: { include: { tenant: { select: { id: true, name: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.serializeRelation(row));
  }

  async createRelation(access: CompanyAccess, auth: AuthContext, dto: CreateCommercialRelationDto) {
    const counterparty = validateCounterparty(dto, access.companyId);
    if (counterparty === 'both') {
      throw new UnprocessableEntityException('La relación admite una sola contraparte (§2.4).');
    }
    if (counterparty === 'none') {
      throw new UnprocessableEntityException('La relación requiere una contraparte (§2.4).');
    }
    if (counterparty === 'self') {
      throw new UnprocessableEntityException('La contraparte no puede ser la propia empresa.');
    }

    if (dto.counterpartyCompanyId) {
      const exists = await this.prisma.company.findUnique({
        where: { id: dto.counterpartyCompanyId },
      });
      if (!exists) throw new NotFoundException('Contraparte no encontrada.');
    }
    if (dto.clientRelationshipId) {
      const client = await this.prisma.clientRelationship.findFirst({
        where: { id: dto.clientRelationshipId, companyId: access.companyId },
      });
      if (!client) throw new NotFoundException('Cliente propio no encontrado.');
    }

    const emergencyExtraAmount = dto.emergencyExtraAmount?.trim() || null;
    if (
      !validateEmergencyAmount(
        dto.emergencyPolicy ?? 'prior_authorization',
        nullableToCents(emergencyExtraAmount),
      )
    ) {
      throw new UnprocessableEntityException(
        'La política emergency_amount requiere un importe adicional positivo (§8.6).',
      );
    }

    const duplicate = await this.prisma.commercialRelation.findFirst({
      where: {
        companyId: access.companyId,
        ...(dto.counterpartyCompanyId
          ? { counterpartyCompanyId: dto.counterpartyCompanyId }
          : { clientRelationshipId: dto.clientRelationshipId }),
      },
    });
    if (duplicate) throw new ConflictException('Ya existe una relación con esa contraparte.');

    const created = await this.prisma.$transaction(async (tx) => {
      const relation = await tx.commercialRelation.create({
        data: {
          companyId: access.companyId,
          counterpartyCompanyId: dto.counterpartyCompanyId ?? null,
          clientRelationshipId: dto.clientRelationshipId ?? null,
          label: dto.label?.trim() || null,
          emergencyPolicy: dto.emergencyPolicy ?? null,
          emergencyExtraAmount,
          createdBy: auth.userId,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA4.COMMERCIAL_RELATION_CREATED,
          entityType: AUDIT_ENTITIES_ETAPA4.COMMERCIAL_RELATION,
          entityId: relation.id,
          payload: {
            counterpartyCompanyId: relation.counterpartyCompanyId,
            clientRelationshipId: relation.clientRelationshipId,
            emergencyPolicy: relation.emergencyPolicy,
            emergencyExtraAmount: decimalString(relation.emergencyExtraAmount),
          },
        },
        tx,
      );
      return relation;
    });

    const full = await this.prisma.commercialRelation.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        counterpartyCompany: { select: { id: true, name: true } },
        clientRelationship: { include: { tenant: { select: { id: true, name: true } } } },
      },
    });
    return this.serializeRelation(full);
  }

  async updateRelation(
    access: CompanyAccess,
    auth: AuthContext,
    relationId: string,
    dto: UpdateCommercialRelationDto,
  ) {
    const relation = await this.prisma.commercialRelation.findFirst({
      where: { id: relationId, companyId: access.companyId },
    });
    if (!relation) throw new NotFoundException('Relación no encontrada.');

    const wasEnded = relation.endedAt !== null;
    if (dto.ended === false && wasEnded) {
      throw new UnprocessableEntityException('Una relación finalizada no se reabre (§2.4).');
    }

    const emergencyPolicy =
      dto.emergencyPolicy !== undefined ? dto.emergencyPolicy : relation.emergencyPolicy;
    const emergencyExtraAmount =
      dto.emergencyExtraAmount !== undefined
        ? dto.emergencyExtraAmount?.trim() || null
        : decimalString(relation.emergencyExtraAmount);
    if (
      !validateEmergencyAmount(emergencyPolicy ?? 'prior_authorization', nullableToCents(emergencyExtraAmount))
    ) {
      throw new UnprocessableEntityException(
        'La política emergency_amount requiere un importe adicional positivo (§8.6).',
      );
    }

    const labelChanged = dto.label !== undefined && (dto.label?.trim() || null) !== relation.label;
    const overrideChanged =
      dto.emergencyPolicy !== undefined || dto.emergencyExtraAmount !== undefined;
    const endedNow = dto.ended === true && !wasEnded;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.commercialRelation.update({
        where: { id: relation.id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label?.trim() || null } : {}),
          ...(dto.emergencyPolicy !== undefined ? { emergencyPolicy: dto.emergencyPolicy } : {}),
          ...(dto.emergencyExtraAmount !== undefined
            ? { emergencyExtraAmount: dto.emergencyExtraAmount?.trim() || null }
            : {}),
          ...(endedNow ? { endedAt: new Date() } : {}),
        },
      });
      if (overrideChanged) {
        await this.audit.record(
          {
            companyId: access.companyId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA4.COMMERCIAL_RELATION_CHANGED,
            entityType: AUDIT_ENTITIES_ETAPA4.COMMERCIAL_RELATION,
            entityId: relation.id,
            payload: {
              emergencyPolicy: result.emergencyPolicy,
              emergencyExtraAmount: decimalString(result.emergencyExtraAmount),
            },
          },
          tx,
        );
      }
      if (labelChanged) {
        await this.audit.record(
          {
            companyId: access.companyId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA4.COMMERCIAL_RELATION_CHANGED,
            entityType: AUDIT_ENTITIES_ETAPA4.COMMERCIAL_RELATION,
            entityId: relation.id,
            payload: { label: result.label },
          },
          tx,
        );
      }
      if (endedNow) {
        await this.audit.record(
          {
            companyId: access.companyId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA4.COMMERCIAL_RELATION_ENDED,
            entityType: AUDIT_ENTITIES_ETAPA4.COMMERCIAL_RELATION,
            entityId: relation.id,
            payload: { endedAt: result.endedAt?.toISOString() ?? null },
          },
          tx,
        );
      }
      return result;
    });
    return this.serializeRelation(updated);
  }

  // -------------------------------------------------------------------------
  // §4.2 Order economic policy (§8.4–§8.6)
  // -------------------------------------------------------------------------

  async getOrderPolicy(access: CompanyAccess, orderId: string) {
    const { order, role } = await this.loadOrderForCompany(orderId, access);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: order.companyId },
    });
    return this.serializeOrderPolicy(order, company, role);
  }

  async updateOrderPolicy(
    access: CompanyAccess,
    auth: AuthContext,
    orderId: string,
    dto: UpdateOrderEconomicPolicyDto,
  ) {
    const { order, role } = await this.loadOrderForCompany(orderId, access);
    if (role !== 'owner') {
      throw new ForbiddenException(
        'Solo la empresa originadora configura la política económica de la orden (§8.4).',
      );
    }

    // Margin (§8.5): ≤ 20 %, and an enabled margin always carries a percent.
    const marginPercentValue =
      dto.marginPercent !== undefined
        ? dto.marginPercent?.trim() || null
        : decimalString(order.marginPercent);
    if (marginPercentValue !== null && !isValidMarginPercent(marginPercentValue)) {
      throw new UnprocessableEntityException('El margen comercial no puede superar el 20 % (§8.5).');
    }
    const marginEnabled = dto.marginEnabled ?? order.marginEnabled;
    if (marginEnabled && marginPercentValue === null) {
      throw new UnprocessableEntityException('El margen activo requiere un porcentaje (máx. 20 %).');
    }

    // Commercial relation (§8.6): must exist, be active and include the
    // order's company as one of its two parties.
    let commercialRelationId = order.commercialRelationId;
    if (dto.commercialRelationId !== undefined) {
      commercialRelationId = dto.commercialRelationId?.trim() || null;
    }
    if (commercialRelationId !== null) {
      const relation = await this.prisma.commercialRelation.findUnique({
        where: { id: commercialRelationId },
      });
      if (!relation || !relationGovernsCompany(relation, order.companyId)) {
        throw new NotFoundException('Relación comercial no encontrada.');
      }
      if (!isRelationAttachable(relation)) {
        throw new UnprocessableEntityException(
          'La relación comercial está finalizada y no admite órdenes nuevas (§2.4).',
        );
      }
    }

    const previousLimitCents = nullableToCents(decimalString(order.spendingLimit));
    const limitChanged =
      dto.spendingLimit !== undefined &&
      nullableToCents(dto.spendingLimit?.trim() || null) !== previousLimitCents;
    const marginChanged =
      (dto.marginEnabled !== undefined && dto.marginEnabled !== order.marginEnabled) ||
      (dto.marginPercent !== undefined &&
        nullableToCents(marginPercentValue) !== nullableToCents(decimalString(order.marginPercent)));

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          ...(dto.spendingLimit !== undefined
            ? {
                spendingLimit: dto.spendingLimit?.trim() || null,
                spendingLimitSetBy: auth.userId,
                spendingLimitSetAt: new Date(),
              }
            : {}),
          ...(dto.marginEnabled !== undefined ? { marginEnabled: dto.marginEnabled } : {}),
          ...(dto.marginPercent !== undefined
            ? { marginPercent: dto.marginPercent?.trim() || null }
            : {}),
          ...(dto.marginEnabled !== undefined || dto.marginPercent !== undefined
            ? { marginSetBy: auth.userId, marginSetAt: new Date() }
            : {}),
          ...(dto.commercialRelationId !== undefined ? { commercialRelationId } : {}),
        },
      });
      if (limitChanged) {
        await this.audit.record(
          {
            companyId: order.companyId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA4.ORDER_SPENDING_LIMIT_CHANGED,
            entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
            entityId: order.id,
            payload: {
              previousLimit: fromCents(previousLimitCents),
              newLimit: fromCents(nullableToCents(dto.spendingLimit?.trim() || null)),
              setBy: auth.userId,
            },
          },
          tx,
        );
      }
      if (marginChanged) {
        await this.audit.record(
          {
            companyId: order.companyId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA4.ORDER_MARGIN_CHANGED,
            entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
            entityId: order.id,
            payload: { marginEnabled, marginPercent: marginPercentValue },
          },
          tx,
        );
      }
    });

    return this.getOrderPolicy(access, orderId);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Loads an order for the caller's company: the owning company gets the
   * `owner` role; a company holding (or having held) an assignment on one of
   * its jobs gets `assignee`; anyone else gets 404 (§16.8).
   */
  private async loadOrderForCompany(orderId: string, access: CompanyAccess) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { commercialRelation: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    if (order.companyId === access.companyId) return { order, role: 'owner' as const };

    const assignment = await this.prisma.assignment.findFirst({
      where: { job: { orderId }, assigneeMembership: { companyId: access.companyId } },
    });
    if (!assignment) throw new NotFoundException('Orden no encontrada.');
    return { order, role: 'assignee' as const };
  }

  private serializeSettings(company: Company) {
    return {
      companyId: company.id,
      defaultSpendingLimit: fromCents(nullableToCents(decimalString(company.defaultSpendingLimit))),
      emergencyPolicy: company.emergencyPolicy,
      emergencyExtraAmount: fromCents(nullableToCents(decimalString(company.emergencyExtraAmount))),
    };
  }

  private serializeRelation(relation: RelationRow) {
    return {
      id: relation.id,
      label: relation.label,
      counterpartyCompanyId: relation.counterpartyCompanyId,
      counterpartyCompanyName: relation.counterpartyCompany?.name ?? null,
      clientRelationshipId: relation.clientRelationshipId,
      clientName: relation.clientRelationship?.tenant.name ?? null,
      emergencyPolicy: relation.emergencyPolicy,
      emergencyExtraAmount: fromCents(nullableToCents(decimalString(relation.emergencyExtraAmount))),
      endedAt: relation.endedAt?.toISOString() ?? null,
      createdAt: relation.createdAt.toISOString(),
    };
  }

  private serializeOrderPolicy(
    order: Order & { commercialRelation: CommercialRelation | null },
    company: Company,
    role: 'owner' | 'assignee',
  ) {
    const effective = resolveEmergencyPolicy(
      order.commercialRelation
        ? {
            emergencyPolicy: order.commercialRelation.emergencyPolicy,
            emergencyExtraAmountCents: nullableToCents(decimalString(order.commercialRelation.emergencyExtraAmount)),
          }
        : null,
      {
        emergencyPolicy: company.emergencyPolicy,
        emergencyExtraAmountCents: nullableToCents(decimalString(company.emergencyExtraAmount)),
      },
    );
    const base = {
      orderId: order.id,
      spendingLimit: fromCents(nullableToCents(decimalString(order.spendingLimit))),
      effectiveEmergencyPolicy: {
        policy: effective.policy,
        extraAmount: fromCents(effective.extraAmountCents),
        source: effective.source,
      },
    };
    if (role === 'owner') {
      return {
        ...base,
        marginEnabled: order.marginEnabled,
        marginPercent: fromCents(nullableToCents(decimalString(order.marginPercent))),
        commercialRelationId: order.commercialRelationId,
      };
    }
    return base;
  }
}
