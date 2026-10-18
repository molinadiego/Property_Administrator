import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Job, Order, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AUDIT_ACTIONS_ETAPA2,
  AUDIT_ACTIONS_ETAPA3,
  AUDIT_ACTIONS_ETAPA6,
  AUDIT_ENTITIES_ETAPA2,
} from '../audit/audit-actions';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { AddJobDto } from './dto/add-job.dto';
import { CreateAssignmentDto, RejectAssignmentDto } from './dto/create-assignment.dto';
import {
  CancelOrderDto,
  CompleteJobDto,
  JobIncompleteDto,
  JobProgressDto,
  NotRealizedDto,
} from './dto/job-action.dto';
import {
  canCancelOrder,
  canCloseOrder,
  canTransitionJob,
  isTerminalJobStatus,
  orderStatusAfterJobStart,
} from './job-rules';
import { isValidMarginPercent } from '../economic-settings/spending-rules';
import { isRelationAttachable, relationGovernsCompany } from '../economic-settings/relation-rules';

/** Type of a `job_events` row as written inside a transaction (spec §2.5). */
type JobEventData = {
  jobId: string;
  companyId: string;
  type: 'progress_note' | 'started' | 'completed' | 'incomplete' | 'resumed' | 'not_realized';
  message?: string | null;
  actorUserId?: string | null;
};

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
    private readonly dispatch: NotificationDispatchService,
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

    // Etapa 4 (spec etapa-4 §4.2, §8.4–§8.6): economic policy at creation.
    const marginPercent = dto.marginPercent?.trim() || null;
    if (marginPercent !== null && !isValidMarginPercent(marginPercent)) {
      throw new UnprocessableEntityException('El margen comercial no puede superar el 20 % (§8.5).');
    }
    const marginEnabled = dto.marginEnabled ?? false;
    if (marginEnabled && marginPercent === null) {
      throw new UnprocessableEntityException('El margen activo requiere un porcentaje (máx. 20 %).');
    }
    let commercialRelationId: string | null = null;
    if (dto.commercialRelationId) {
      const relation = await this.prisma.commercialRelation.findUnique({
        where: { id: dto.commercialRelationId },
      });
      if (!relation || !relationGovernsCompany(relation, access.companyId)) {
        throw new NotFoundException('Relación comercial no encontrada.');
      }
      if (!isRelationAttachable(relation)) {
        throw new UnprocessableEntityException(
          'La relación comercial está finalizada y no admite órdenes nuevas (§2.4).',
        );
      }
      commercialRelationId = relation.id;
    }
    // Spending limit (§8.4): explicit value, explicit null («sin límite») or
    // the company's general policy by default. Creation always *decides* the
    // limit, so the audit marker records it — including the explicit «sin
    // límite» of `applyCompanyDefault: false` (matrix #36, AC-4.6).
    let spendingLimit: string | null;
    if (dto.spendingLimit !== undefined) {
      spendingLimit = dto.spendingLimit?.trim() || null;
    } else if (dto.applyCompanyDefault === false) {
      spendingLimit = null;
    } else {
      spendingLimit = company.defaultSpendingLimit?.toString() || null;
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
          spendingLimit,
          spendingLimitSetBy: auth.userId,
          spendingLimitSetAt: new Date(),
          marginEnabled,
          marginPercent,
          ...(marginEnabled || marginPercent !== null
            ? { marginSetBy: auth.userId, marginSetAt: new Date() }
            : {}),
          commercialRelationId,
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
          payload: { title: created.title, propertyId: property.id, origin, spendingLimit },
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

    // Etapa 6 (spec etapa-6.md §4.2, §14.2): the urgent flag belongs to the
    // order's company only, and only while the order is active (§20.1).
    if (dto.urgent !== undefined) {
      if (order.companyId !== access.companyId) {
        throw new ForbiddenException('Solo la empresa de la orden marca la urgencia (§14.2).');
      }
      if (order.status === 'completed' || order.status === 'cancelled') {
        throw new ConflictException('La orden cerrada no admite cambios de urgencia (§20.1).');
      }
    }

    const manages = await this.managesOrder(order, access);
    if (!manages) {
      // Foreign company: existence is never leaked (§16.8) → 404.
      const isRelated = await this.isRelatedToOrder(order, access);
      if (!isRelated) throw new NotFoundException('Orden no encontrada.');
      throw new ForbiddenException(
        'Solo la empresa responsable de la orden o el contratista asignado editan sus instrucciones.',
      );
    }

    const data: Record<string, string | null | boolean> = {};
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
      const normalized = (value as string).trim() || null;
      data[field] = normalized;
      before[field] = order[field as keyof typeof order] as string | null;
      after[field] = normalized;
    }
    if (dto.urgent !== undefined) data.urgent = dto.urgent;

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
      if (dto.urgent !== undefined && dto.urgent !== order.urgent) {
        await this.audit.record(
          {
            companyId: access.companyId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA6.ORDER_URGENCY_SET,
            entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
            entityId: orderId,
            payload: { urgent: dto.urgent },
          },
          tx,
        );
      }
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
    // Etapa 3 (approved decision, spec §1 / decision 1): accepting moves the
    // job to `accepted`, NOT to `in_progress` — §20.2 «Aceptado → En curso»
    // requires the explicit `start`. An incomplete job picked up by a new
    // assignee (after reassign) also lands on `accepted`.
    if (job.status !== 'pending' && job.status !== 'incomplete') {
      throw new ConflictException('El trabajo no admite una nueva aceptación.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: assignment.id },
        data: { status: 'accepted', respondedAt: new Date() },
      });
      await tx.job.update({ where: { id: job.id }, data: { status: 'accepted' } });
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
    // §14.1 (etapa-6): the assigner is told the assignment was accepted.
    await this.notifyAssigner(assignment, 'accepted');
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
    // §14.1 (etapa-6): the assigner is told the assignment was rejected.
    await this.notifyAssigner(assignment, 'rejected', dto.reason);
    return { id: assignment.id, status: 'rejected' as const };
  }

  /**
   * Creates a new assignment for a job, keeping history (§5.7, §20.3). Only
   * the owning company (§16.1): a related company gets 403, an unrelated one
   * 404. Now also **revokes** the previous assignment when it was still active
   * (Etapa 3 decision 4) and refuses while the job is `in_progress` (§6.2: the
   * professional must report `incomplete` first).
   */
  async reassign(
    access: CompanyAccess,
    auth: AuthContext,
    assignmentId: string,
    dto: CreateAssignmentDto,
  ) {
    const previous = await this.prisma.assignment.findFirst({
      where: { id: assignmentId },
      include: { job: { include: { order: true } } },
    });
    if (!previous) throw new NotFoundException('Asignación no encontrada.');
    await this.assertResponsible(previous.job.order, access);

    const job = previous.job;
    // §6.2/§11: an in-progress job must first be reported incomplete, so the
    // reason and state land in `job_events` before the responsible changes.
    if (job.status === 'in_progress') {
      throw new ConflictException('El trabajo está en curso: primero debe informarse incompleto.');
    }
    const assignee = await this.prisma.membership.findFirst({
      where: { id: dto.assigneeMembershipId, status: 'active' },
    });
    if (!assignee) throw new NotFoundException('Asignado no encontrado.');

    let revokedAssignmentId: string | null = null;
    const assignment = await this.prisma.$transaction(async (tx) => {
      // §5.7/§20.3: a revoked assignment is never reactivated; both rows stay.
      if (previous.status === 'pending' || previous.status === 'accepted') {
        await tx.assignment.update({
          where: { id: previous.id },
          data: { status: 'revoked' },
        });
        revokedAssignmentId = previous.id;
      }
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
          payload: {
            jobId: job.id,
            previousAssignmentId: previous.id,
            revokedAssignmentId,
            assigneeMembershipId: assignee.id,
          },
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
      revokedAssignmentId,
    };
  }

  // -------------------------------------------------------------------------
  // Etapa 3: job tracking, responsible decisions, close & cancel
  // (docs/especificacion/etapa-3.md §4.1–§4.3)
  // -------------------------------------------------------------------------

  /**
   * The assigned professional begins their own job (§6.1, §20.2):
   * `accepted → in_progress`, first `started_at`, event + audit, and the order
   * moves to `in_progress` (§20.1 «Aceptada → En curso», AC-3.1).
   */
  async startJob(access: CompanyAccess, auth: AuthContext, jobId: string) {
    const job = await this.findOwnJob(jobId, auth);
    if (!canTransitionJob(job.status, 'in_progress')) {
      throw new ConflictException('El trabajo no puede iniciarse desde su estado actual.');
    }
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: job.orderId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        // `started_at` is set once and never cleared: it is the marker that
        // decides order cancellation (§20.1, spec §2.2).
        data: { status: 'in_progress', startedAt: job.startedAt ?? new Date() },
      });
      await this.addJobEvent(tx, { jobId: job.id, companyId: job.companyId, type: 'started', actorUserId: auth.userId });
      const nextStatus = orderStatusAfterJobStart(order.status);
      if (nextStatus !== order.status) {
        await tx.order.update({ where: { id: order.id }, data: { status: nextStatus } });
      }
      await this.audit.record(
        {
          companyId: job.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.JOB_STARTED,
          entityType: AUDIT_ENTITIES_ETAPA2.JOB,
          entityId: job.id,
          payload: { jobId: job.id, orderId: job.orderId },
        },
        tx,
      );
    });
  }

  /** Free progress note (§6.1): a `job_events` row, never an audit entry (§7). */
  async recordProgress(access: CompanyAccess, auth: AuthContext, jobId: string, dto: JobProgressDto) {
    const job = await this.findOwnJob(jobId, auth);
    if (isTerminalJobStatus(job.status)) {
      throw new ConflictException('El trabajo ya está finalizado.');
    }
    const event = await this.prisma.$transaction(async (tx) =>
      this.addJobEvent(tx, {
        jobId: job.id,
        companyId: job.companyId,
        type: 'progress_note',
        message: dto.message,
        actorUserId: auth.userId,
      }),
    );
    return {
      id: event.id,
      jobId: job.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    };
  }

  /** The professional marks their own job done (§6.1, §20.2). */
  async completeJob(access: CompanyAccess, auth: AuthContext, jobId: string, dto: CompleteJobDto) {
    const job = await this.findOwnJob(jobId, auth);
    if (!canTransitionJob(job.status, 'done')) {
      throw new ConflictException('Solo un trabajo en curso puede completarse.');
    }
    const result = dto.result?.trim() || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { id: job.id }, data: { status: 'done', completedAt: new Date() } });
      await this.addJobEvent(tx, {
        jobId: job.id,
        companyId: job.companyId,
        type: 'completed',
        message: result,
        actorUserId: auth.userId,
      });
      await this.audit.record(
        {
          companyId: job.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.JOB_COMPLETED,
          entityType: AUDIT_ENTITIES_ETAPA2.JOB,
          entityId: job.id,
          payload: { jobId: job.id, orderId: job.orderId, result },
        },
        tx,
      );
    });
  }

  /** The professional reports they could not finish (§6.2, §20.2). */
  async reportIncomplete(access: CompanyAccess, auth: AuthContext, jobId: string, dto: JobIncompleteDto) {
    const job = await this.findOwnJob(jobId, auth);
    if (!canTransitionJob(job.status, 'incomplete')) {
      throw new ConflictException('Solo un trabajo en curso puede quedar incompleto.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { id: job.id }, data: { status: 'incomplete' } });
      await this.addJobEvent(tx, {
        jobId: job.id,
        companyId: job.companyId,
        type: 'incomplete',
        message: dto.reason,
        actorUserId: auth.userId,
      });
      await this.audit.record(
        {
          companyId: job.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.JOB_INCOMPLETE,
          entityType: AUDIT_ENTITIES_ETAPA2.JOB,
          entityId: job.id,
          payload: { jobId: job.id, orderId: job.orderId, reason: dto.reason },
        },
        tx,
      );
    });
  }

  /**
   * The responsible party authorizes continuing with the SAME professional
   * (§6.2, §20.2): `incomplete → in_progress` only while the accepted
   * assignment is still active (matrix #11, #13).
   */
  async resumeJob(access: CompanyAccess, auth: AuthContext, jobId: string) {
    const job = await this.findResponsibleJob(jobId, access);
    if (!canTransitionJob(job.status, 'in_progress')) {
      throw new ConflictException('Solo un trabajo incompleto puede reanudarse.');
    }
    const active = await this.prisma.assignment.findFirst({
      where: { jobId: job.id, status: 'accepted' },
    });
    if (!active) {
      throw new ConflictException('El trabajo no conserva al profesional que lo venía haciendo.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { id: job.id }, data: { status: 'in_progress' } });
      await this.addJobEvent(tx, { jobId: job.id, companyId: job.companyId, type: 'resumed', actorUserId: auth.userId });
      await this.audit.record(
        {
          companyId: job.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.JOB_RESUMED,
          entityType: AUDIT_ENTITIES_ETAPA2.JOB,
          entityId: job.id,
          payload: { jobId: job.id, orderId: job.orderId },
        },
        tx,
      );
    });
  }

  /**
   * «No pudo concretarse» (§6.3): terminal with a mandatory reason; the job,
   * its history and its assignments rows are kept (§6.3 «No se elimina el
   * trabajo ni su historial»); active assignments are revoked (§16.6).
   */
  async notRealizeJob(access: CompanyAccess, auth: AuthContext, jobId: string, dto: NotRealizedDto) {
    const job = await this.findResponsibleJob(jobId, access);
    if (!canTransitionJob(job.status, 'not_realized')) {
      throw new ConflictException('El trabajo ya está finalizado.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { id: job.id }, data: { status: 'not_realized' } });
      await tx.assignment.updateMany({
        where: { jobId: job.id, status: { in: ['pending', 'accepted'] } },
        data: { status: 'revoked' },
      });
      await this.addJobEvent(tx, {
        jobId: job.id,
        companyId: job.companyId,
        type: 'not_realized',
        message: dto.reason,
        actorUserId: auth.userId,
      });
      await this.audit.record(
        {
          companyId: job.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.JOB_NOT_REALIZED,
          entityType: AUDIT_ENTITIES_ETAPA2.JOB,
          entityId: job.id,
          payload: { jobId: job.id, orderId: job.orderId, reason: dto.reason },
        },
        tx,
      );
    });
  }

  /**
   * Revokes an active assignment (§20.3): the job returns to `pending` when it
   * never started; an `in_progress` job must first report `incomplete` (matrix
   * #19). A revoked assignment is never reactivated (matrix #21).
   */
  async revokeAssignment(access: CompanyAccess, auth: AuthContext, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { job: { include: { order: true } } },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada.');
    await this.assertResponsible(assignment.job.order, access);

    if (assignment.status !== 'pending' && assignment.status !== 'accepted') {
      throw new ConflictException('La asignación ya no está activa.');
    }
    if (assignment.job.status === 'in_progress') {
      throw new ConflictException('El trabajo está en curso: primero debe informarse incompleto.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.update({ where: { id: assignment.id }, data: { status: 'revoked' } });
      if (assignment.job.status === 'accepted') {
        await tx.job.update({ where: { id: assignment.jobId }, data: { status: 'pending' } });
      }
      await this.audit.record(
        {
          companyId: assignment.job.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.ASSIGNMENT_REVOKED,
          entityType: AUDIT_ENTITIES_ETAPA2.ASSIGNMENT,
          entityId: assignment.id,
          payload: { jobId: assignment.jobId, orderId: assignment.job.orderId },
        },
        tx,
      );
    });
  }

  /**
   * Closes the order (§6.4): every job must be `done` or `not_realized`; the
   * row keeps `originator_id`, `company_id` and `closed_by`/`closed_at`
   * separately. The preconditions are re-evaluated inside the transaction with
   * a row lock (spec §11).
   */
  async closeOrder(access: CompanyAccess, auth: AuthContext, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    await this.assertResponsible(order, access);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const jobs = await tx.job.findMany({ where: { orderId }, select: { status: true } });
      if (!canCloseOrder(current.status, jobs)) {
        throw new ConflictException('La orden no puede cerrarse: hay trabajos sin finalizar o ya fue cerrada.');
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'completed', closedBy: auth.userId, closedAt: new Date() },
      });
      await this.audit.record(
        {
          companyId: current.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.ORDER_CLOSED,
          entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
          entityId: orderId,
          payload: {
            originatorId: current.originatorId,
            companyId: current.companyId,
            closedBy: auth.userId,
          },
        },
        tx,
      );
    });
  }

  /**
   * Cancels the whole order (§20.1): only from `open`/`assigned`, only while
   * no job has started, mandatory reason, active assignments revoked (§16.6).
   */
  async cancelOrder(access: CompanyAccess, auth: AuthContext, orderId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    await this.assertResponsible(order, access);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const jobs = await tx.job.findMany({ where: { orderId }, select: { startedAt: true } });
      if (!canCancelOrder(current.status, jobs)) {
        throw new ConflictException(
          current.status === 'in_progress' || jobs.some((j) => j.startedAt !== null)
            ? 'La orden ya tiene trabajo realizado: no puede cancelarse.'
            : 'La orden no está en un estado cancelable.',
        );
      }
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          cancelledBy: auth.userId,
          cancelledAt: new Date(),
          cancellationReason: dto.reason,
        },
      });
      await tx.assignment.updateMany({
        where: { status: { in: ['pending', 'accepted'] }, job: { orderId } },
        data: { status: 'revoked' },
      });
      await this.audit.record(
        {
          companyId: current.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.ORDER_CANCELLED,
          entityType: AUDIT_ENTITIES_ETAPA2.ORDER,
          entityId: orderId,
          payload: { reason: dto.reason },
        },
        tx,
      );
    });
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

  /**
   * §14.1 (etapa-6.md): the user who created the assignment learns about
   * the response — in-app always, email unless the user disabled it (D6).
   * Runs after the commit; a provider failure never breaks the response.
   */
  private async notifyAssigner(
    assignment: { id: string; companyId: string; assignedBy: string; jobId: string },
    kind: 'accepted' | 'rejected',
    reason?: string | null,
  ) {
    const job = await this.prisma.job.findUniqueOrThrow({
      where: { id: assignment.jobId },
      select: { title: true, order: { select: { title: true } } },
    });
    const type = kind === 'accepted' ? 'assignment_accepted' : 'assignment_rejected';
    const orderTitle = job.order.title;
    const title = kind === 'accepted' ? 'Asignación aceptada' : 'Asignación rechazada';
    const body =
      kind === 'accepted'
        ? `Se aceptó la asignación del trabajo "${job.title}" de la orden "${orderTitle}".`
        : `Se rechazó la asignación del trabajo "${job.title}" de la orden "${orderTitle}".` +
          (reason ? ` Motivo: ${reason.trim()}` : '');
    await this.notifications.notify({
      userId: assignment.assignedBy,
      companyId: assignment.companyId,
      type,
      title,
      body,
      entityType: 'assignment',
      entityId: assignment.id,
    });

    const assigner = await this.prisma.user.findUnique({
      where: { id: assignment.assignedBy },
      select: { email: true },
    });
    if (!assigner) return;
    await this.dispatch.sendNoticeIfEnabled({ userId: assignment.assignedBy }, type, {
      to: assigner.email,
      subject: `${title}: "${orderTitle}"`,
      text: `${body}\n\nConsulta el detalle en la plataforma.\n`,
      html: `<p>${body.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p><p>Consulta el detalle en la plataforma.</p>`,
    });
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

  /** Active membership ids of the caller (permissions read per request, §16.6). */
  private async activeMembershipIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'active' },
      select: { id: true },
    });
    return memberships.map((m) => m.id);
  }

  /**
   * Resolves a job for its OWN professional (§6.1, §16.3): the active assignee
   * proceeds; a member of the owning company — who sees the job but is not the
   * assignee — gets 403 (matrix #3); everyone else gets 404 (matrix #4, #5,
   * #10: another professional's job is simply not in their scope).
   */
  private async findOwnJob(jobId: string, auth: AuthContext): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    const membershipIds = await this.activeMembershipIds(auth.userId);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        jobId: job.id,
        assigneeMembershipId: { in: membershipIds },
        status: { in: ['pending', 'accepted'] },
      },
    });
    if (assignment) return job;
    const member = await this.prisma.membership.findFirst({
      where: { companyId: job.companyId, userId: auth.userId, status: 'active' },
    });
    if (member) {
      throw new ForbiddenException('Este trabajo no es tuyo: solo quien lo tiene asignado lo registra.');
    }
    throw new NotFoundException('Trabajo no encontrado.');
  }

  /**
   * Resolves a job for the RESPONSIBLE party (§6.2, §6.3): only the owning
   * company decides; a related company (holds or held an assignment) gets 403
   * (matrix #12, #17); an unrelated one gets 404 (§16.8).
   */
  private async findResponsibleJob(jobId: string, access: CompanyAccess): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    const order = await this.prisma.order.findUnique({ where: { id: job.orderId } });
    if (!order) throw new NotFoundException('Trabajo no encontrado.');
    await this.assertResponsible(order, access);
    return job;
  }

  /** §16.1/§16.8: owning company proceeds, related company 403, unrelated 404. */
  private async assertResponsible(order: Order, access: CompanyAccess): Promise<void> {
    if (order.companyId === access.companyId) return;
    const related = await this.prisma.assignment.findFirst({
      where: { job: { orderId: order.id }, assigneeMembership: { companyId: access.companyId } },
    });
    if (!related) throw new NotFoundException('Orden no encontrada.');
    throw new ForbiddenException('Solo la empresa responsable de la orden toma esta decisión.');
  }

  /** Appends a `job_events` row (append-only job history, spec §2.5). */
  private async addJobEvent(tx: Prisma.TransactionClient, event: JobEventData) {
    return tx.jobEvent.create({
      data: {
        jobId: event.jobId,
        companyId: event.companyId,
        type: event.type,
        message: event.message ?? null,
        actorUserId: event.actorUserId ?? null,
      },
    });
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
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
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
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
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
      // Etapa 6 (§14.2): urgent flag, editable while the order is active.
      urgent: order.urgent,
      origin: order.origin,
      propertyId: order.propertyId,
      companyId: order.companyId,
      parentOrderId: order.parentOrderId,
      // Etapa 3 (spec §2.2, §6.4): closing/cancellation are separate,
      // auditable events with their own actor and timestamp.
      closedBy: order.closedBy,
      closedAt: order.closedAt ? order.closedAt.toISOString() : null,
      cancelledBy: order.cancelledBy,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      cancellationReason: order.cancellationReason,
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
