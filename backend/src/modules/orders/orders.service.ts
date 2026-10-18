import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS_ETAPA2, AUDIT_ENTITIES_ETAPA2 } from '../audit/audit-actions';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { AddJobDto } from './dto/add-job.dto';
import { CreateAssignmentDto, RejectAssignmentDto } from './dto/create-assignment.dto';

/**
 * Orders, jobs and assignments (spec etapa-2.md §2.6–§2.8, §5.1–§5.8).
 *
 * Visibility (§2.12 / §16.8): an order is visible when it belongs to the
 * caller's company OR the caller holds an active (pending/accepted) assignment
 * on one of its jobs. Foreign companies always get 404, never 403 (etapa-1 §3).
 * Access info (lockbox, §5.8) is returned only to the owning company or to the
 * currently assigned professional — losing the assignment loses access (§4.5).
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Creates the order and its first job (§5.1, §5.3). */
  async create(access: CompanyAccess, auth: AuthContext, dto: CreateOrderDto) {
    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, companyId: access.companyId },
    });
    if (!property) throw new NotFoundException('Propiedad no encontrada.');

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: access.companyId },
    });
    const origin = this.originFor(company.type);

    let clientRelationshipId: string | null = null;
    if (origin === 'own_business') {
      if (dto.clientRelationshipId) {
        const rel = await this.prisma.clientRelationship.findFirst({
          where: { id: dto.clientRelationshipId, companyId: access.companyId },
        });
        if (!rel) throw new NotFoundException('Cliente propio no encontrado.');
        clientRelationshipId = rel.id;
      }
    } else if (dto.clientRelationshipId) {
      throw new ConflictException('clientRelationshipId solo aplica a empresas de negocio propio.');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          companyId: access.companyId,
          propertyId: property.id,
          title: dto.title.trim(),
          description: dto.description.trim(),
          origin,
          originatorId: auth.userId,
          clientRelationshipId,
          accessLockbox: dto.accessLockbox?.trim() || null,
          accessCommunityCode: dto.accessCommunityCode?.trim() || null,
          accessEntryInstructions: dto.accessEntryInstructions?.trim() || null,
          status: 'open',
        },
      });
      await tx.job.create({
        data: {
          orderId: created.id,
          companyId: access.companyId,
          title: created.title,
          description: created.description,
          sortOrder: 1,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.ORDER_CREATED,
          entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
          entityId: created.id,
          payload: { title: created.title, propertyId: property.id, origin },
        },
        tx,
      );
      return created;
    });

    return this.serialize(order, { includeAccess: true, jobs: await this.jobsOf(order.id, 'all') });
  }

  /** Orders of the company plus those assigned to the caller (§2.12). */
  async list(access: CompanyAccess, auth: AuthContext) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: auth.userId, status: 'active' },
      select: { id: true },
    });
    const membershipIds = memberships.map((m) => m.id);
    const rows = await this.prisma.order.findMany({
      where: {
        OR: [
          { companyId: access.companyId },
          {
            jobs: {
              some: {
                assignments: {
                  some: {
                    assigneeMembershipId: { in: membershipIds },
                    // Only active assignments grant visibility (§2.12); a
                    // rejected one no longer exposes the order (matrix #10).
                    status: { in: ['pending', 'accepted'] },
                  },
                },
              },
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return Promise.all(
      rows.map(async (order) => {
        const isOwn = order.companyId === access.companyId;
        return this.serialize(order, {
          includeAccess: isOwn,
          jobs: await this.jobsOf(order.id, isOwn ? 'all' : 'own', membershipIds),
        });
      }),
    );
  }

  async getDetail(access: CompanyAccess, auth: AuthContext, orderId: string) {
    const order = await this.findVisible(orderId, access, auth);
    const isOwn = order.companyId === access.companyId;
    const memberships = await this.prisma.membership.findMany({
      where: { userId: auth.userId, status: 'active' },
      select: { id: true },
    });
    const membershipIds = memberships.map((m) => m.id);
    const hasActiveAssignment = isOwn || (await this.hasActiveAssignment(order.id, membershipIds));
    return this.serialize(order, {
      includeAccess: hasActiveAssignment,
      jobs: await this.jobsOf(order.id, isOwn ? 'all' : 'own', membershipIds),
    });
  }

  /**
   * Edits instructions/access of an order the company manages (§4.4, matrix
   * #17): the owning company or a contractor with an active assignment on one
   * of its jobs. The professional who only reports an error gets 403 (§4.4).
   */
  async update(
    access: CompanyAccess,
    auth: AuthContext,
    orderId: string,
    dto: UpdateOrderDto,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');

    const manages = await this.managesOrder(order, access);
    if (!manages) {
      // Foreign company: existence is never leaked (§16.8) → 404.
      const isRelated = await this.isRelatedToOrder(order, access);
      if (!isRelated) throw new NotFoundException('Orden no encontrada.');
      throw new ForbiddenException(
        'Solo la empresa responsable de la orden o el contratista asignado editan sus instrucciones.',
      );
    }

    const data: Record<string, string | null> = {};
    const before: Record<string, string | null> = {};
    const after: Record<string, string | null> = {};
    const fields: Array<keyof UpdateOrderDto> = [
      'title',
      'description',
      'accessLockbox',
      'accessCommunityCode',
      'accessEntryInstructions',
    ];
    for (const field of fields) {
      const value = dto[field];
      if (value === undefined) continue;
      const normalized = value.trim() || null;
      data[field] = normalized;
      before[field] = order[field as keyof typeof order] as string | null;
      after[field] = normalized;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({ where: { id: orderId }, data });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.ORDER_UPDATED,
          entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
          entityId: orderId,
          payload: { before, after },
        },
        tx,
      );
      return result;
    });

    return this.serialize(updated, {
      includeAccess: true,
      jobs: await this.jobsOf(updated.id, 'all'),
    });
  }

  /** Adds a job to a compound order (§5.5). Only the owning company. */
  async addJob(access: CompanyAccess, auth: AuthContext, orderId: string, dto: AddJobDto) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, companyId: access.companyId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');

    const last = await this.prisma.job.findFirst({
      where: { orderId },
      orderBy: { sortOrder: 'desc' },
    });
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          orderId,
          companyId: access.companyId,
          title: dto.title.trim(),
          description: dto.description.trim(),
          sortOrder: (last?.sortOrder ?? 0) + 1,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.JOB_ADDED,
          entityType: AUDIT_ENTITIES_ETAPA2.JOB,
          entityId: created.id,
          payload: { orderId, title: created.title, sortOrder: created.sortOrder },
        },
        tx,
      );
      return created;
    });
    return { id: job.id, orderId: job.orderId, title: job.title, sortOrder: job.sortOrder, status: job.status };
  }

  /** Assigns a job to a membership (§5.6). Only the owning company. */
  async assign(access: CompanyAccess, auth: AuthContext, orderId: string, dto: CreateAssignmentDto) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, companyId: access.companyId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    const job = await this.prisma.job.findFirst({ where: { id: dto.jobId, orderId } });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');

    const assignee = await this.prisma.membership.findFirst({
      where: { id: dto.assigneeMembershipId, status: 'active' },
      include: { user: true },
    });
    if (!assignee) throw new NotFoundException('Asignado no encontrado.');

    // A job may have only one active assignment at a time (§5.7: reassign
    // happens after a rejection, which closes the previous one).
    const active = await this.prisma.assignment.findFirst({
      where: { jobId: job.id, status: { in: ['pending', 'accepted'] } },
    });
    if (active) throw new ConflictException('El trabajo ya tiene una asignación activa.');

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: {
          jobId: job.id,
          companyId: access.companyId,
          assigneeMembershipId: assignee.id,
          assignedBy: auth.userId,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.ASSIGNMENT_CREATED,
          entityType: AUDIT_ENTITIES_ETAPA2.ASSIGNMENT,
          entityId: created.id,
          payload: { jobId: job.id, orderId, assigneeMembershipId: assignee.id },
        },
        tx,
      );
      await this.notifications.notify(
        {
          userId: assignee.userId,
          companyId: access.companyId,
          type: 'assignment_requested',
          title: 'Nuevo trabajo asignado',
          body: `Se te asignó el trabajo "${job.title}" de la orden "${order.title}".`,
          entityType: 'assignment',
          entityId: created.id,
        },
        tx,
      );
      return created;
    });

    return { id: assignment.id, jobId: assignment.jobId, status: assignment.status };
  }

  /** Accepts an assignment (§5.6). Only the assignee. */
  async accept(access: CompanyAccess, auth: AuthContext, assignmentId: string) {
    const assignment = await this.findAssignable(assignmentId, access, auth);
    if (assignment.status !== 'pending') {
      throw new ConflictException('La asignación ya fue respondida.');
    }
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: assignment.jobId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: assignment.id },
        data: { status: 'accepted', respondedAt: new Date() },
      });
      await tx.job.update({ where: { id: job.id }, data: { status: 'in_progress' } });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.ASSIGNMENT_ACCEPTED,
          entityType: AUDIT_ENTITIES_ETAPA2.ASSIGNMENT,
          entityId: assignment.id,
          payload: { jobId: job.id },
        },
        tx,
      );
    });
    return { id: assignment.id, status: 'accepted' as const };
  }

  /** Rejects an assignment; the job stays pending for reassignment (§5.6). */
  async reject(
    access: CompanyAccess,
    auth: AuthContext,
    assignmentId: string,
    dto: RejectAssignmentDto,
  ) {
    const assignment = await this.findAssignable(assignmentId, access, auth);
    if (assignment.status !== 'pending') {
      throw new ConflictException('La asignación ya fue respondida.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: assignment.id },
        data: {
          status: 'rejected',
          respondedAt: new Date(),
          rejectionReason: dto.reason?.trim() || null,
        },
      });
      // §5.6: rejecting does not cancel the underlying job; it stays pending.
      await tx.job.update({ where: { id: assignment.jobId }, data: { status: 'pending' } });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.ASSIGNMENT_REJECTED,
          entityType: AUDIT_ENTITIES_ETAPA2.ASSIGNMENT,
          entityId: assignment.id,
          payload: { jobId: assignment.jobId, reason: dto.reason ?? null },
        },
        tx,
      );
    });
    return { id: assignment.id, status: 'rejected' as const };
  }

  /** Creates a new assignment for a rejected/pending job, keeping history
   * (§5.7). Only the owning company. */
  async reassign(
    access: CompanyAccess,
    auth: AuthContext,
    assignmentId: string,
    dto: CreateAssignmentDto,
  ) {
    const previous = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, companyId: access.companyId },
      include: { job: { include: { order: true } } },
    });
    if (!previous) throw new NotFoundException('Asignación no encontrada.');

    const job = previous.job;
    const assignee = await this.prisma.membership.findFirst({
      where: { id: dto.assigneeMembershipId, status: 'active' },
    });
    if (!assignee) throw new NotFoundException('Asignado no encontrado.');

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: {
          jobId: job.id,
          companyId: access.companyId,
          assigneeMembershipId: assignee.id,
          assignedBy: auth.userId,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.ASSIGNMENT_REASSIGNED,
          entityType: AUDIT_ENTITIES_ETAPA2.ASSIGNMENT,
          entityId: created.id,
          payload: { jobId: job.id, previousAssignmentId: previous.id, assigneeMembershipId: assignee.id },
        },
        tx,
      );
      return created;
    });
    return {
      id: assignment.id,
      jobId: assignment.jobId,
      status: assignment.status,
      previousAssignmentId: previous.id,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private originFor(type: string): 'management' | 'contractor' | 'own_business' {
    if (type === 'property_management') return 'management';
    if (type === 'contractor') return 'contractor';
    return 'own_business';
  }

  private async findVisible(orderId: string, access: CompanyAccess, auth: AuthContext) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    if (order.companyId === access.companyId) return order;

    const memberships = await this.prisma.membership.findMany({
      where: { userId: auth.userId, status: 'active' },
      select: { id: true },
    });
    const visible = await this.hasActiveAssignment(
      order.id,
      memberships.map((m) => m.id),
    );
    if (!visible) throw new NotFoundException('Orden no encontrada.');
    return order;
  }

  private async hasActiveAssignment(orderId: string, membershipIds: string[]): Promise<boolean> {
    if (membershipIds.length === 0) return false;
    const found = await this.prisma.assignment.findFirst({
      where: {
        assigneeMembershipId: { in: membershipIds },
        status: { in: ['pending', 'accepted'] },
        job: { orderId },
      },
    });
    return found !== null;
  }

  /** The company owns the order or manages it via an active assignment (§4.4). */
  private async managesOrder(
    order: Order,
    access: CompanyAccess,
  ): Promise<boolean> {
    if (order.companyId === access.companyId) return true;
    const found = await this.prisma.assignment.findFirst({
      where: {
        status: { in: ['pending', 'accepted'] },
        job: { orderId: order.id },
        assigneeMembership: { companyId: access.companyId },
      },
    });
    return found !== null;
  }

  /** The company ever held an assignment on the order (any status). */
  private async isRelatedToOrder(order: Order, access: CompanyAccess): Promise<boolean> {
    const found = await this.prisma.assignment.findFirst({
      where: {
        job: { orderId: order.id },
        assigneeMembership: { companyId: access.companyId },
      },
    });
    return found !== null;
  }

  private async findAssignable(assignmentId: string, access: CompanyAccess, auth: AuthContext) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { assigneeMembership: true },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada.');
    if (assignment.assigneeMembership.userId !== auth.userId) {
      // Existence of other companies' assignments is never leaked (§16.8).
      throw new NotFoundException('Asignación no encontrada.');
    }
    if (assignment.assigneeMembership.companyId !== access.companyId) {
      throw new ForbiddenException('La asignación no pertenece a este espacio.');
    }
    return assignment;
  }

  private async jobsOf(
    orderId: string,
    scope: 'all' | 'own',
    membershipIds: string[] = [],
  ) {
    const jobs = await this.prisma.job.findMany({
      where: { orderId },
      orderBy: { sortOrder: 'asc' },
      include: { assignments: { orderBy: { createdAt: 'asc' } } },
    });
    if (scope === 'all') {
      return jobs.map((job) => ({
        id: job.id,
        title: job.title,
        description: job.description,
        sortOrder: job.sortOrder,
        status: job.status,
        assignments: job.assignments.map((a) => ({
          id: a.id,
          status: a.status,
          assigneeMembershipId: a.assigneeMembershipId,
          respondedAt: a.respondedAt?.toISOString() ?? null,
          rejectionReason: a.rejectionReason,
          createdAt: a.createdAt.toISOString(),
        })),
      }));
    }
    // Assigned professional: only the jobs they currently work on (§2.3).
    return jobs
      .filter((job) =>
        job.assignments.some(
          (a) =>
            membershipIds.includes(a.assigneeMembershipId) &&
            (a.status === 'pending' || a.status === 'accepted'),
        ),
      )
      .map((job) => ({
        id: job.id,
        title: job.title,
        description: job.description,
        sortOrder: job.sortOrder,
        status: job.status,
        assignments: job.assignments
          .filter((a) => membershipIds.includes(a.assigneeMembershipId))
          .map((a) => ({
            id: a.id,
            status: a.status,
            assigneeMembershipId: a.assigneeMembershipId,
            respondedAt: a.respondedAt?.toISOString() ?? null,
            rejectionReason: a.rejectionReason,
            createdAt: a.createdAt.toISOString(),
          })),
      }));
  }

  /** Serializes an order; access info only for authorized viewers (§4.5/§5.8). */
  private serialize(
    order: Order,
    opts: { includeAccess: boolean; jobs: unknown },
  ) {
    return {
      id: order.id,
      title: order.title,
      description: order.description,
      status: order.status,
      origin: order.origin,
      propertyId: order.propertyId,
      companyId: order.companyId,
      parentOrderId: order.parentOrderId,
      access: opts.includeAccess
        ? {
            lockbox: order.accessLockbox,
            communityCode: order.accessCommunityCode,
            entryInstructions: order.accessEntryInstructions,
          }
        : null,
      jobs: opts.jobs,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
