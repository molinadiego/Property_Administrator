import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ACTIONS_ETAPA7, AUDIT_ENTITIES } from '../audit/audit-actions';
import { AuthContext } from '../../common/request-context';
import { CompanyAccess } from '../../common/request-context';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

/** Fiscal-profile fields audited on every change (spec etapa-7.md §7). */
const TAX_PROFILE_FIELDS = ['taxId', 'taxAddress', 'defaultTaxRate', 'taxExempt'] as const;

type TaxProfileShape = {
  taxId: string | null;
  taxAddress: string | null;
  defaultTaxRate: { toFixed: (places: number) => string } | null;
  taxExempt: boolean;
};

const taxProfileOf = (company: TaxProfileShape) => ({
  taxId: company.taxId,
  taxAddress: company.taxAddress,
  defaultTaxRate: company.defaultTaxRate ? company.defaultTaxRate.toFixed(3) : null,
  taxExempt: company.taxExempt,
});

/**
 * Companies / workspaces (tenant root, spec §2.2). Creating a space makes the
 * creator its first active owner (AC-2.1); revocation of members lives in
 * MembershipsService (spec §3.3).
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(auth: AuthContext, dto: CreateCompanyDto) {
    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: { name: dto.name.trim(), type: dto.type, createdBy: auth.userId },
      });
      await tx.membership.create({
        data: { companyId: created.id, userId: auth.userId, role: 'owner' },
      });
      await this.audit.record(
        {
          companyId: created.id,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.COMPANY_CREATED,
          entityType: AUDIT_ENTITIES.COMPANY,
          entityId: created.id,
          payload: { name: created.name, type: created.type },
        },
        tx,
      );
      return created;
    });

    return {
      id: company.id,
      name: company.name,
      type: company.type,
      createdAt: company.createdAt.toISOString(),
    };
  }

  /** Spaces of the current user (active memberships only). */
  async listMine(auth: AuthContext) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: auth.userId, status: 'active' },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      companyId: m.company.id,
      name: m.company.name,
      type: m.company.type,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  /** Detail of one space; access already validated by CompanyAccessGuard. */
  async getDetail(companyId: string, access: CompanyAccess) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    return {
      id: company.id,
      name: company.name,
      type: company.type,
      role: access.role,
      // Etapa 7 D5: the fiscal profile is not sensitive data — any active
      // member of the company may read it (§11.6).
      taxProfile: taxProfileOf(company),
      createdAt: company.createdAt.toISOString(),
    };
  }

  /**
   * Edits the space: name plus the fiscal profile (etapa-7.md D5, §11.6) —
   * only the highest role may do it (guard: `owner`). The change of the
   * fiscal fields is audited as `company.tax_profile_updated` (§12).
   */
  async update(access: CompanyAccess, auth: AuthContext, dto: UpdateCompanyDto) {
    if (dto.name === undefined && !TAX_PROFILE_FIELDS.some((field) => dto[field] !== undefined)) {
      throw new BadRequestException('Envía al menos un campo para actualizar (400).');
    }
    const company = await this.prisma.$transaction(async (tx) => {
      const current = await tx.company.findUniqueOrThrow({ where: { id: access.companyId } });
      const taxChanged = TAX_PROFILE_FIELDS.some((field) => dto[field] !== undefined);
      const updated = await tx.company.update({
        where: { id: current.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          // Empty strings normalize to null; only sent fields change (D5).
          ...(dto.taxId !== undefined ? { taxId: dto.taxId.trim() || null } : {}),
          ...(dto.taxAddress !== undefined ? { taxAddress: dto.taxAddress.trim() || null } : {}),
          ...(dto.defaultTaxRate !== undefined ? { defaultTaxRate: dto.defaultTaxRate } : {}),
          ...(dto.taxExempt !== undefined ? { taxExempt: dto.taxExempt } : {}),
        },
      });
      if (dto.name !== undefined) {
        await this.audit.record(
          {
            companyId: updated.id,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS.COMPANY_UPDATED,
            entityType: AUDIT_ENTITIES.COMPANY,
            entityId: updated.id,
            payload: { before: { name: current.name }, after: { name: updated.name } },
          },
          tx,
        );
      }
      if (taxChanged) {
        await this.audit.record(
          {
            companyId: updated.id,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA7.COMPANY_TAX_PROFILE_UPDATED,
            entityType: AUDIT_ENTITIES.COMPANY,
            entityId: updated.id,
            payload: {
              before: taxProfileOf(current),
              after: taxProfileOf(updated),
            },
          },
          tx,
        );
      }
      return updated;
    });

    return {
      id: company.id,
      name: company.name,
      type: company.type,
      taxProfile: taxProfileOf(company),
      createdAt: company.createdAt.toISOString(),
    };
  }
}
