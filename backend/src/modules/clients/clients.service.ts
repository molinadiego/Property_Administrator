import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS_ETAPA2, AUDIT_ENTITIES_ETAPA2 } from '../audit/audit-actions';
import { PropertiesService } from '../properties/properties.service';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { normalizeEmail } from '../../common/tokens';
import { CreateClientDto } from './dto/create-client.dto';

/**
 * Own clients of a professional (spec §2.3, §4.3, §5.1). Only `own_business`
 * companies register clients; the client becomes a limited-access account
 * (approved decision, spec §3) and orders for them are created by the
 * professional (§5.1).
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly propertiesService: PropertiesService,
  ) {}

  async create(access: CompanyAccess, auth: AuthContext, dto: CreateClientDto) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: access.companyId },
    });
    if (company.type !== 'own_business') {
      throw new ForbiddenException('Solo un negocio propio registra clientes.');
    }

    const email = dto.email ? normalizeEmail(dto.email) : null;
    if (email) {
      const existing = await this.prisma.tenant.findUnique({ where: { email } });
      if (existing) throw new ConflictException('Ya existe una cuenta con ese email.');
    }

    const { tenant: client, relationshipId } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          email,
          phones: (dto.phones ?? []) as Prisma.InputJsonValue,
          address: dto.address?.trim() || null,
          availability: dto.availability?.trim() || null,
        },
      });
      const rel = await tx.clientRelationship.create({
        data: { companyId: access.companyId, tenantId: tenant.id, createdBy: auth.userId },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.CLIENT_CREATED,
          entityType: AUDIT_ENTITIES_ETAPA2.CLIENT_RELATIONSHIP,
          entityId: tenant.id,
          payload: { name: tenant.name, email },
        },
        tx,
      );
      return { tenant, relationshipId: rel.id };
    });

    let accessIssued = false;
    if (email) {
      await this.propertiesService.issueLimitedAccess(client.id, email, client.name);
      accessIssued = true;
    }

    return {
      id: client.id,
      relationshipId,
      name: client.name,
      email,
      accessIssued,
    };
  }

  async list(access: CompanyAccess) {
    const rows = await this.prisma.clientRelationship.findMany({
      where: { companyId: access.companyId },
      include: { tenant: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.tenant.id,
      relationshipId: row.id,
      name: row.tenant.name,
      email: row.tenant.email,
      phones: row.tenant.phones,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Resolves the client of this company (used by the order creation flow). */
  async resolveCompanyClient(companyId: string, clientRelationshipId: string) {
    const rel = await this.prisma.clientRelationship.findFirst({
      where: { id: clientRelationshipId, companyId },
    });
    if (!rel) throw new NotFoundException('Cliente propio no encontrado.');
    return rel;
  }
}
