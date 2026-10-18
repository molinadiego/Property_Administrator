import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Assignment, CostReport, Order, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';
import { AUDIT_ACTIONS_ETAPA4, AUDIT_ENTITIES_ETAPA4 } from '../audit/audit-actions';
import { BillingService } from '../billing/billing.service';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { PutCostItemsDto, SubmitCostReportDto } from './dto/cost-items.dto';
import {
  canSubmitCostReport,
  nextVersionNumber,
  totalCentsOf,
  validateCostItems,
} from './cost-rules';
import { fromCents, nullableToCents } from '../economic-settings/spending-rules';

type AssignmentContext = {
  assignment: Assignment;
  order: Order;
  emitterCompanyId: string;
  role: 'emitter' | 'owner';
};

type CostReportRow = CostReport & {
  items: Array<{
    id: string;
    category: string;
    description: string;
    amount: Prisma.Decimal;
    isEmergency: boolean;
  }>;
};

/**
 * Cost reports per assignment (spec etapa-4.md §4.3, §8.1–§8.3). Each
 * assignment — one commercial relation — owns an editable draft and any
 * number of immutable submitted versions; corrections open the next version
 * linked to the previous one (§8.2). Registration is never blocked by the
 * spending limit (§8.5): the overage flag lives in the economic summary.
 */
@Injectable()
export class CostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly preferences: NotificationPreferencesService,
    private readonly billing: BillingService,
  ) {}

  async getCostReport(access: CompanyAccess, assignmentId: string) {
    const { assignment, order, emitterCompanyId, role } = await this.loadAssignment(assignmentId, access);
    const reports = await this.prisma.costReport.findMany({
      where: { assignmentId: assignment.id },
      include: { items: { orderBy: { createdAt: 'asc' } } },
      orderBy: { version: 'asc' },
    });
    const submitted = reports.filter((report) => report.status === 'submitted');
    // The draft belongs to the emitter: the originating company only learns
    // about it once it is submitted (AC-4.1, matrix #9 of etapa-4 §6.2).
    const visible = role === 'owner' ? submitted : reports;
    const current = visible.length > 0 ? visible[visible.length - 1] : null;
    return {
      assignmentId: assignment.id,
      orderId: order.id,
      emitterCompanyId,
      current: current ? this.serializeReport(current) : null,
      versions: submitted.map((report) => this.serializeReport(report)),
    };
  }

  /**
   * Replaces the draft's items (§8.1, §4.3): creates the first draft when the
   * assignment has no report yet; 409 once a version was submitted, until a
   * correction reopens a draft (§8.2, matrix #11).
   */
  async putItems(
    access: CompanyAccess,
    assignmentId: string,
    dto: PutCostItemsDto,
  ) {
    const { assignment, emitterCompanyId, role } = await this.loadAssignment(assignmentId, access);
    if (role !== 'emitter') {
      throw new ForbiddenException('Solo la empresa asignada registra sus costos (§8.1).');
    }

    const validation = validateCostItems(dto.items);
    if (!validation.valid) throw new UnprocessableEntityException(validation.reason);

    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM assignments WHERE id = ${assignment.id} FOR UPDATE`;
      let report = await tx.costReport.findFirst({
        where: { assignmentId: assignment.id, status: 'draft' },
      });
      if (!report) {
        const latest = await tx.costReport.findFirst({
          where: { assignmentId: assignment.id },
          orderBy: { version: 'desc' },
        });
        if (latest) {
          // A submitted version exists with no open draft: corrections go
          // through `correct` so the chain stays linked (§8.2, matrix #11).
          throw new ConflictException(
            'El reporte ya fue enviado: abre una corrección para registrar cambios (§8.2).',
          );
        }
        report = await tx.costReport.create({
          data: {
            assignmentId: assignment.id,
            companyId: emitterCompanyId,
            version: nextVersionNumber(null),
            notes: dto.notes?.trim() || null,
          },
        });
      } else if (dto.notes !== undefined) {
        await tx.costReport.update({
          where: { id: report.id },
          data: { notes: dto.notes?.trim() || null },
        });
      }
      await tx.costItem.deleteMany({ where: { costReportId: report.id } });
      await tx.costItem.createMany({
        data: dto.items.map((item) => ({
          costReportId: report.id,
          category: item.category,
          description: item.description.trim(),
          amount: item.amount,
          isEmergency: item.isEmergency ?? false,
        })),
      });
      return tx.costReport.findUniqueOrThrow({
        where: { id: report.id },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
    });

    return this.serializeReport(saved);
  }

  /**
   * Confirms the submission (§8.1): freezes the draft, computes the total,
   * notifies the recipient (§14.1) and audits. Preconditions are re-checked
   * inside the transaction with a row lock (concurrent submit → one 204).
   */
  async submit(access: CompanyAccess, auth: AuthContext, assignmentId: string, dto: SubmitCostReportDto) {
    const { assignment, order, emitterCompanyId, role } = await this.loadAssignment(assignmentId, access);
    if (role !== 'emitter') {
      throw new ForbiddenException('Solo la empresa asignada envía sus costos (§8.1).');
    }
    if (!canSubmitCostReport(assignment)) {
      throw new ForbiddenException(
        'La asignación nunca aceptó el trabajo: no puede enviar costos (decisión 8, §20.2).',
      );
    }

    const { report, totalCents } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM assignments WHERE id = ${assignment.id} FOR UPDATE`;
      const draft = await tx.costReport.findFirst({
        where: { assignmentId: assignment.id, status: 'draft' },
        include: { items: true },
      });
      if (!draft) {
        throw new ConflictException('No hay borrador de costos para enviar.');
      }
      if (draft.items.length === 0) {
        throw new UnprocessableEntityException('El reporte debe tener al menos un ítem (§8.1).');
      }
      const cents = totalCentsOf(draft.items.map((item) => ({ amount: item.amount.toString() })));
      const result = await tx.costReport.update({
        where: { id: draft.id },
        data: {
          status: 'submitted',
          total: fromCents(cents),
          submittedBy: auth.userId,
          submittedAt: new Date(),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      await this.audit.record(
        {
          companyId: emitterCompanyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA4.COST_REPORT_SUBMITTED,
          entityType: AUDIT_ENTITIES_ETAPA4.COST_REPORT,
          entityId: result.id,
          payload: {
            assignmentId: assignment.id,
            orderId: order.id,
            version: result.version,
            total: fromCents(cents),
            itemCount: draft.items.length,
          },
        },
        tx,
      );
      if (result.previousReportId) {
        // A submitted correction is its own audit event (§7): the previous
        // version stays intact and the chain remains navigable (§8.2).
        const previous = await tx.costReport.findUniqueOrThrow({
          where: { id: result.previousReportId },
          select: { version: true },
        });
        await this.audit.record(
          {
            companyId: emitterCompanyId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA4.COST_REPORT_CORRECTED,
            entityType: AUDIT_ENTITIES_ETAPA4.COST_REPORT,
            entityId: result.id,
            payload: {
              assignmentId: assignment.id,
              previousVersion: previous.version,
              newVersion: result.version,
            },
          },
          tx,
        );
      }
      return { report: result, totalCents: cents };
    });

    const actor = await this.prisma.user.findUnique({ where: { id: auth.userId } });
    const recipient = await this.recipientContact(order);
    if (recipient) {
      const params = {
        orderTitle: order.title,
        version: report.version,
        submittedByName: actor?.name ?? 'Profesional asignado',
      };
      const noticeType = report.previousReportId ? 'cost_corrected' : 'costs_submitted';
      if (await this.preferences.isEmailEnabled(recipient.userId, noticeType)) {
        if (report.previousReportId) {
          await this.email.sendCostCorrected(recipient.email, params);
        } else {
          await this.email.sendCostsSubmitted(recipient.email, {
            ...params,
            total: fromCents(totalCents) ?? '0.00',
          });
        }
      }
    }
    // Spec etapa-5 D9 (proyect.md §8.2): a cost correction never touches an
    // emitted invoice — it only notifies the parties that have one.
    await this.billing.notifyCostCorrection(order.id, emitterCompanyId);
    return this.serializeReport(report);
  }

  /** Opens a corrected draft copying the last submitted version (§8.2). */
  async correct(access: CompanyAccess, assignmentId: string) {
    const { assignment, emitterCompanyId, role } = await this.loadAssignment(assignmentId, access);
    if (role !== 'emitter') {
      throw new ForbiddenException('Solo la empresa asignada corrige sus costos (§8.2).');
    }

    const reports = await this.prisma.costReport.findMany({
      where: { assignmentId: assignment.id },
      include: { items: { orderBy: { createdAt: 'asc' } } },
      orderBy: { version: 'asc' },
    });
    const submitted = reports.filter((report) => report.status === 'submitted');
    if (submitted.length === 0) {
      throw new ConflictException('No hay versión enviada que corregir (§8.2).');
    }
    const lastSubmitted = submitted[submitted.length - 1];

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM assignments WHERE id = ${assignment.id} FOR UPDATE`;
      const openDraft = await tx.costReport.findFirst({
        where: { assignmentId: assignment.id, status: 'draft' },
      });
      if (openDraft) {
        throw new ConflictException('Ya hay un borrador abierto: envíalo o trabaja sobre él.');
      }
      const latest = await tx.costReport.findFirst({
        where: { assignmentId: assignment.id },
        orderBy: { version: 'desc' },
      });
      const draft = await tx.costReport.create({
        data: {
          assignmentId: assignment.id,
          companyId: emitterCompanyId,
          version: nextVersionNumber(latest?.version ?? null),
          notes: lastSubmitted.notes,
          previousReportId: lastSubmitted.id,
        },
      });
      await tx.costItem.createMany({
        data: lastSubmitted.items.map((item) => ({
          costReportId: draft.id,
          category: item.category,
          description: item.description,
          amount: item.amount.toString(),
          isEmergency: item.isEmergency,
        })),
      });
      return tx.costReport.findUniqueOrThrow({
        where: { id: draft.id },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
    });

    return this.serializeReport(created);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Loads an assignment and tells the caller's role (§8.3, §16.9): `emitter`
   * is the assignee's company (the one that registers costs); `owner` is the
   * order's company (reads them). Everyone else gets 404.
   */
  private async loadAssignment(
    assignmentId: string,
    access: CompanyAccess,
  ): Promise<AssignmentContext> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { assigneeMembership: true, job: { include: { order: true } } },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada.');
    const order = assignment.job.order;
    const emitterCompanyId = assignment.assigneeMembership.companyId;
    if (access.companyId === emitterCompanyId) {
      return { assignment, order, emitterCompanyId, role: 'emitter' };
    }
    if (access.companyId === order.companyId) {
      return { assignment, order, emitterCompanyId, role: 'owner' };
    }
    throw new NotFoundException('Asignación no encontrada.');
  }

  /** Email recipient of cost notifications (§8.1, §14.1): the order's
   * originator, falling back to an owner of the originating company. */
  /** Recipient contact (originator or owner) for cost notices (§14.1, D6). */
  private async recipientContact(
    order: Order,
  ): Promise<{ userId: string; email: string } | null> {
    if (order.originatorId) {
      const originator = await this.prisma.user.findUnique({
        where: { id: order.originatorId },
        select: { email: true },
      });
      if (originator) return { userId: order.originatorId, email: originator.email };
    }
    const owner = await this.prisma.membership.findFirst({
      where: { companyId: order.companyId, role: 'owner', status: 'active' },
      include: { user: { select: { email: true } } },
    });
    return owner ? { userId: owner.userId, email: owner.user.email } : null;
  }

  private serializeReport(report: CostReportRow) {
    return {
      id: report.id,
      assignmentId: report.assignmentId,
      version: report.version,
      status: report.status,
      notes: report.notes,
      total: fromCents(nullableToCents(report.total?.toFixed(2) ?? null)),
      submittedAt: report.submittedAt?.toISOString() ?? null,
      previousReportId: report.previousReportId,
      createdAt: report.createdAt.toISOString(),
      items: report.items.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        amount: fromCents(nullableToCents(item.amount.toFixed(2))),
        isEmergency: item.isEmergency,
      })),
    };
  }
}
