import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS_ETAPA2, AUDIT_ENTITIES_ETAPA2 } from '../audit/audit-actions';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Limited-access flows (spec etapa-2.md §4.4, approved token decision §3).
 *
 * A limited account (property owner, tenant, own client) lists the orders of
 * its housing/relation — status only, never costs or invoices (§4.3) — and
 * places work requests that become `requested` orders, to be converted by a
 * company user (§5.1: they never create real orders by themselves).
 */
@Injectable()
export class LimitedAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Orders of the tenant's housing/relation, minimal fields (§4.3). */
  async listOrders(tenantId: string) {
    const [propertyLinks, clientLinks] = await Promise.all([
      this.prisma.propertyTenant.findMany({ where: { tenantId }, include: { property: true } }),
      this.prisma.clientRelationship.findMany({ where: { tenantId } }),
    ]);
    const propertyIds = propertyLinks.map((l) => l.propertyId);
    const relationshipIds = clientLinks.map((l) => l.id);

    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          ...(propertyIds.length > 0 ? [{ propertyId: { in: propertyIds } }] : []),
          ...(relationshipIds.length > 0
            ? [{ clientRelationshipId: { in: relationshipIds } }]
            : []),
          { requestedByTenantId: tenantId },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });

    // Status only (§4.3): no costs, no access codes, no other relations.
    return orders.map((order) => ({
      id: order.id,
      title: order.title,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
    }));
  }

  /**
   * Places a work request (§5.1): becomes an order with status `requested`
   * that a company user must convert. Property tenants request on their
   * property; client tenants must reference one of their professional's
   * properties (§5.1: no property yet → the professional registers a ficha).
   */
  async createRequest(
    tenantId: string,
    dto: { title: string; description: string; propertyId?: string },
  ) {
    const target = await this.resolveTarget(tenantId, dto.propertyId);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          companyId: target.companyId,
          propertyId: target.propertyId,
          title: dto.title.trim(),
          description: dto.description.trim(),
          origin: target.origin,
          originatorId: null,
          clientRelationshipId: target.clientRelationshipId,
          requestedByTenantId: tenantId,
          status: 'requested',
        },
      });
      await this.audit.record(
        {
          companyId: target.companyId,
          actorType: 'system',
          actorUserId: null,
          action: AUDIT_ACTIONS_ETAPA2.ORDER_CREATED,
          entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
          entityId: created.id,
          payload: { via: 'limited_request', title: created.title, propertyId: target.propertyId },
        },
        tx,
      );
      // Notify the company owners: a request needs a human to convert it.
      const owners = await tx.membership.findMany({
        where: { companyId: target.companyId, status: 'active', role: 'owner' },
      });
      for (const owner of owners) {
        await this.notifications.notify(
          {
            userId: owner.userId,
            companyId: target.companyId,
            type: 'order_created',
            title: 'Nuevo pedido de trabajo',
            body: `Se recibió el pedido "${created.title}". Conviértelo en orden para asignarlo.`,
            entityType: 'order',
            entityId: created.id,
          },
          tx,
        );
      }
      return created;
    });

    return { id: order.id, title: order.title, status: order.status };
  }

  /** Converts a `requested` order into a real one (§5.1, AC-4.5). */
  async convertRequest(companyId: string, orderId: string, actorUserId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, companyId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    if (order.status !== 'requested') {
      throw new UnprocessableEntityException('Solo se convierten órdenes en estado requested.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: order.id },
        data: { status: 'open', originatorId: actorUserId },
      });
      await tx.job.create({
        data: {
          orderId: result.id,
          companyId,
          title: result.title,
          description: result.description,
          sortOrder: 1,
        },
      });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          action: AUDIT_ACTIONS_ETAPA2.ORDER_CONVERTED_FROM_REQUEST,
          entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
          entityId: result.id,
          payload: { requestedByTenantId: order.requestedByTenantId },
        },
        tx,
      );
      return result;
    });

    return { id: updated.id, status: updated.status };
  }

  private async resolveTarget(
    tenantId: string,
    propertyId: string | undefined,
  ): Promise<{
    companyId: string;
    propertyId: string;
    clientRelationshipId: string | null;
    origin: 'management' | 'contractor' | 'own_business';
  }> {
    // Property-linked tenant (owner/occupant): their housing.
    const propertyLink = await this.prisma.propertyTenant.findFirst({
      where: { tenantId, ...(propertyId ? { propertyId } : {}) },
      include: { property: true },
    });
    if (propertyLink) {
      const company = await this.prisma.company.findUniqueOrThrow({
        where: { id: propertyLink.property.companyId },
      });
      return {
        companyId: propertyLink.property.companyId,
        propertyId: propertyLink.propertyId,
        clientRelationshipId: null,
        origin: company.type === 'property_management' ? 'management' : 'contractor',
      };
    }

    // Client tenant: must reference a property of their professional (§5.1).
    if (!propertyId) {
      throw new UnprocessableEntityException(
        'Indica la propiedad del trabajo; si aún no existe, el profesional debe registrarla primero.',
      );
    }
    const rel = await this.prisma.clientRelationship.findFirst({
      where: { tenantId },
    });
    if (!rel) throw new NotFoundException('Relación no encontrada.');
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, companyId: rel.companyId },
    });
    if (!property) throw new NotFoundException('Propiedad no encontrada.');
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: rel.companyId } });
    return {
      companyId: rel.companyId,
      propertyId: property.id,
      clientRelationshipId: rel.id,
      origin: company.type === 'contractor' ? 'contractor' : 'own_business',
    };
  }
}
