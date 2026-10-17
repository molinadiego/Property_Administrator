import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { AuthContext } from '../../common/request-context';
import { CompanyAccess } from '../../common/request-context';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

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
      createdAt: company.createdAt.toISOString(),
    };
  }

  async update(access: CompanyAccess, auth: AuthContext, dto: UpdateCompanyDto) {
    const company = await this.prisma.$transaction(async (tx) => {
      const current = await tx.company.findUniqueOrThrow({ where: { id: access.companyId } });
      const updated = await tx.company.update({
        where: { id: current.id },
        data: { name: dto.name.trim() },
      });
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
      return updated;
    });

    return {
      id: company.id,
      name: company.name,
      type: company.type,
      createdAt: company.createdAt.toISOString(),
    };
  }
}
