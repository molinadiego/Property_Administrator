import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { Order, OrderAuthorization, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';
import { AUDIT_ACTIONS_ETAPA4, AUDIT_ENTITIES_ETAPA4 } from '../audit/audit-actions';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { CreateAuthorizationRequestDto, ResolveAuthorizationRequestDto } from './dto/authorization-request.dto';
import { RecordAuthorizationDto } from './dto/record-authorization.dto';
import {
  canApproveAdditionalWork,
  canResolveRequest,
  isGrantedAtValid,
  isValidAuthorizationAmount,
} from './authorization-rules';
import {
  computeAuthorizedCeilingCents,
  emergencyCeilingCents,
  emergencyExceeds,
  exceedsLimit,
  fromCents,
  nullableToCents,
  resolveEmergencyPolicy,
} from '../economic-settings/spending-rules';

/** Prisma Decimal → nullable string safe for the pure rules. */
function decimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString();
}

function centsOf(value: Prisma.Decimal | null): number {
  return nullableToCents(decimalString(value)) ?? 0;
}

/**
 * Authorization requests, off-platform constancias and the economic summary
 * (spec etapa-4.md §4.4–§4.6, §8.4–§8.7, §9, §18.1).
 *
 * Permissions (§8.4): only the originating company resolves and records
 * constancias; the assignee company proposes and reads its own scope. The
 * margin is private to the originator (decision 9, §16.9).
 */
@Injectable()
export class AuthorizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  // -------------------------------------------------------------------------
  // §4.4 Solicitudes (§8.4, §9, §14.1)
  // -------------------------------------------------------------------------

  async listRequests(access: CompanyAccess, orderId: string) {
    const { party } = await this.loadOrder(orderId, access);
    const requests = await this.prisma.authorizationRequest.findMany({
      where: {
        orderId,
        ...(party === 'assignee' ? { requestingCompanyId: access.companyId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return requests.map((request) => ({
      id: request.id,
      orderId: request.orderId,
      requestingCompanyId: request.requestingCompanyId,
      type: request.type,
      description: request.description,
      requestedAmount: fromCents(nullableToCents(decimalString(request.requestedAmount))),
      status: request.status,
      resolutionNote: request.resolutionNote,
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    }));
  }

  async createRequest(
    access: CompanyAccess,
    auth: AuthContext,
    orderId: string,
    dto: CreateAuthorizationRequestDto,
  ) {
    const { order, party } = await this.loadOrder(orderId, access);
    if (party !== 'assignee') {
      throw new ForbiddenException(
        'La empresa originadora no solicita: solo autoriza (§8.4).',
      );
    }
    const active = await this.prisma.assignment.findFirst({
      where: {
        job: { orderId },
        assigneeMembership: { companyId: access.companyId },
        status: { in: ['pending', 'accepted'] },
      },
    });
    if (!active) {
      throw new ForbiddenException(
        'Se requiere una asignación activa en la orden para proponer (§9).',
      );
    }

    const requestedAmount = dto.requestedAmount?.trim() || null;
    if (!isValidAuthorizationAmount(nullableToCents(requestedAmount))) {
      throw new UnprocessableEntityException('El importe propuesto debe ser positivo (§11).');
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.authorizationRequest.create({
        data: {
          orderId,
          requestingCompanyId: access.companyId,
          requestedByUserId: auth.userId,
          type: dto.type,
          description: dto.description.trim(),
          requestedAmount,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA4.AUTHORIZATION_REQUESTED,
          entityType: AUDIT_ENTITIES_ETAPA4.AUTHORIZATION_REQUEST,
          entityId: created.id,
          payload: {
            orderId,
            type: dto.type,
            requestedAmount,
            requestingCompanyId: access.companyId,
          },
        },
        tx,
      );
      return created;
    });

    const recipient = await this.originatorContact(order);
    if (
      recipient &&
      (await this.preferences.isEmailEnabled(recipient.userId, 'authorization_requested'))
    ) {
      await this.email.sendAuthorizationRequested(recipient.email, {
        orderTitle: order.title,
        type: request.type,
      });
    }

    return {
      id: request.id,
      orderId,
      type: request.type,
      requestedAmount: fromCents(nullableToCents(requestedAmount)),
      status: request.status,
    };
  }

  async approve(access: CompanyAccess, auth: AuthContext, requestId: string) {
    const resolved = await this.resolveRequest(access, auth, requestId, 'approved', null);

    const requester = await this.prisma.user.findUnique({
      where: { id: resolved.request.requestedByUserId },
      select: { email: true },
    });
    if (
      requester &&
      (await this.preferences.isEmailEnabled(
        resolved.request.requestedByUserId,
        'authorization_resolved',
      ))
    ) {
      await this.email.sendAuthorizationResolved(requester.email, {
        orderTitle: resolved.order.title,
        type: resolved.request.type,
        approved: true,
      });
    }
    return { id: resolved.request.id, status: 'approved' as const };
  }

  async reject(access: CompanyAccess, auth: AuthContext, requestId: string, dto: ResolveAuthorizationRequestDto) {
    const note = dto.note?.trim() || null;
    if (!note) {
      throw new UnprocessableEntityException('El rechazo requiere una nota con el motivo (§9).');
    }
    const resolved = await this.resolveRequest(access, auth, requestId, 'rejected', note);

    const requester = await this.prisma.user.findUnique({
      where: { id: resolved.request.requestedByUserId },
      select: { email: true },
    });
    if (
      requester &&
      (await this.preferences.isEmailEnabled(
        resolved.request.requestedByUserId,
        'authorization_resolved',
      ))
    ) {
      await this.email.sendAuthorizationResolved(requester.email, {
        orderTitle: resolved.order.title,
        type: resolved.request.type,
        approved: false,
        note,
      });
    }
    return { id: resolved.request.id, status: 'rejected' as const };
  }

  // -------------------------------------------------------------------------
  // §4.5 Constancias (§8.7, §18.1)
  // -------------------------------------------------------------------------

  async listAuthorizations(access: CompanyAccess, orderId: string) {
    const { party } = await this.loadOrder(orderId, access);
    const authorizations = await this.prisma.orderAuthorization.findMany({
      // The assignee sees the constancias that affect its ceiling, without
      // the originator's internal notes (§16.9, decision 9).
      where: { orderId, ...(party === 'assignee' ? { type: 'exceed_spending_limit' } : {}) },
      orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
    });
    return authorizations.map((authorization) => this.serializeAuthorization(authorization, party));
  }

  async recordAuthorization(
    access: CompanyAccess,
    auth: AuthContext,
    orderId: string,
    dto: RecordAuthorizationDto,
  ) {
    const { order, party } = await this.loadOrder(orderId, access);
    if (party !== 'owner') {
      throw new ForbiddenException(
        'Solo la empresa originadora registra autorizaciones (§8.4).',
      );
    }

    const grantedAt = new Date(dto.grantedAt);
    if (!isGrantedAtValid(grantedAt, new Date())) {
      throw new UnprocessableEntityException('La fecha de la autorización no puede ser futura.');
    }
    const amountCap = dto.amountCap?.trim() || null;
    if (!isValidAuthorizationAmount(nullableToCents(amountCap))) {
      throw new UnprocessableEntityException(
        'El tope de la autorización debe ser positivo cuando se informa (§11).',
      );
    }

    const authorization = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orderAuthorization.create({
        data: {
          orderId,
          type: dto.type,
          source: 'offline',
          grantedByDescription: dto.grantedByDescription.trim(),
          grantedAt,
          authorizedByUserId: auth.userId,
          amountCap,
          description: dto.description.trim(),
        },
      });
      await this.audit.record(
        {
          companyId: order.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA4.ORDER_AUTHORIZATION_RECORDED,
          entityType: AUDIT_ENTITIES_ETAPA4.ORDER_AUTHORIZATION,
          entityId: created.id,
          payload: { orderId, type: dto.type, amountCap, grantedAt: grantedAt.toISOString() },
        },
        tx,
      );
      return created;
    });

    return this.serializeAuthorization(authorization, 'owner');
  }

  // -------------------------------------------------------------------------
  // §4.6 Resumen económico (§8.4, §8.5, §8.7, §12)
  // -------------------------------------------------------------------------

  async getEconomicSummary(access: CompanyAccess, orderId: string) {
    const { order, party } = await this.loadOrder(orderId, access);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: order.companyId },
    });

    // §8.4 + matrix #36/AC-4.6: an order whose limit was explicitly decided
    // (even as «sin límite») doesn't fall back to the company's general
    // policy; only untouched orders inherit the default.
    const effectiveLimitCents =
      order.spendingLimitSetAt !== null
        ? nullableToCents(decimalString(order.spendingLimit))
        : nullableToCents(decimalString(company.defaultSpendingLimit));

    const authorizations = await this.prisma.orderAuthorization.findMany({
      where: { orderId },
    });
    const ceilingCents = computeAuthorizedCeilingCents(
      effectiveLimitCents,
      authorizations.map((authorization) => ({
        type: authorization.type,
        amountCapCents: nullableToCents(decimalString(authorization.amountCap)),
      })),
    );

    const emergency = resolveEmergencyPolicy(
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
    const emergencyLimitCents = emergencyCeilingCents(emergency);

    // Every submitted report of the order; the assignee's scope is its own.
    const reports = await this.prisma.costReport.findMany({
      where: {
        status: 'submitted',
        assignment: {
          job: { orderId },
          ...(party === 'assignee' ? { assigneeMembership: { companyId: access.companyId } } : {}),
        },
      },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        assignment: { select: { id: true, assigneeMembershipId: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { version: 'asc' }],
    });

    const orderReports = party === 'owner'
      ? reports
      : await this.prisma.costReport.findMany({
          where: { status: 'submitted', assignment: { job: { orderId } } },
          select: { total: true },
        });

    const submittedTotalCents = reports.reduce((sum, report) => sum + centsOf(report.total), 0);
    const emergencyTotalCents = reports.reduce(
      (sum, report) => sum + centsOfTotal(report.items.filter((item) => item.isEmergency)),
      0,
    );
    const orderTotalCents =
      party === 'owner'
        ? submittedTotalCents
        : orderReports.reduce((sum, report) => sum + centsOf(report.total), 0);

    const base = {
      orderId,
      effectiveLimit: fromCents(effectiveLimitCents),
      authorizedExtra:
        ceilingCents !== null && effectiveLimitCents !== null
          ? fromCents(ceilingCents - effectiveLimitCents)
          : null,
      authorizedCeiling: fromCents(ceilingCents),
      // Order-wide signal (§8.4): the assignee must know the order is over
      // its ceiling without seeing other companies' amounts (§16.9).
      exceedsLimit: exceedsLimit(ceilingCents, orderTotalCents),
      submittedTotal: fromCents(submittedTotalCents),
      emergencyPolicy: {
        policy: emergency.policy,
        extraAmount: fromCents(emergency.extraAmountCents),
        source: emergency.source,
      },
      emergencySubmitted: fromCents(emergencyTotalCents),
      emergencyExceeds: emergencyExceeds(emergencyLimitCents, emergencyTotalCents),
      reports: reports.map((report) => ({
        id: report.id,
        assignmentId: report.assignmentId,
        version: report.version,
        total: fromCents(centsOf(report.total)),
        submittedAt: report.submittedAt?.toISOString() ?? null,
        items: report.items.map((item) => ({
          category: item.category,
          description: item.description,
          amount: fromCents(centsOf(item.amount)),
          isEmergency: item.isEmergency,
        })),
      })),
    };

    if (party === 'owner') {
      return {
        ...base,
        margin: {
          enabled: order.marginEnabled,
          percent: fromCents(nullableToCents(decimalString(order.marginPercent))),
        },
      };
    }
    return base;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Loads an order and tells the caller's party (§16.8): `owner` (the
   * originating company) or `assignee` (a company holding an assignment on
   * one of its jobs, past or present). Everyone else gets 404. */
  private async loadOrder(orderId: string, access: CompanyAccess) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { commercialRelation: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    if (order.companyId === access.companyId) return { order, party: 'owner' as const };

    const assignment = await this.prisma.assignment.findFirst({
      where: { job: { orderId }, assigneeMembership: { companyId: access.companyId } },
    });
    if (!assignment) throw new NotFoundException('Orden no encontrada.');
    return { order, party: 'assignee' as const };
  }

  /** Shared approve/reject flow: permission, state machine and constancia
   * creation inside a transaction with a row lock (matrix #34). */
  private async resolveRequest(
    access: CompanyAccess,
    auth: AuthContext,
    requestId: string,
    decision: 'approved' | 'rejected',
    note: string | null,
  ) {
    const request = await this.prisma.authorizationRequest.findUnique({
      where: { id: requestId },
      include: { order: true },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');
    if (request.order.companyId !== access.companyId) {
      const related = await this.prisma.assignment.findFirst({
        where: {
          job: { orderId: request.orderId },
          assigneeMembership: { companyId: access.companyId },
        },
      });
      if (!related) throw new NotFoundException('Solicitud no encontrada.');
      throw new ForbiddenException('Solo la empresa originadora autoriza (§8.4).');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM authorization_requests WHERE id = ${request.id} FOR UPDATE`;
      const current = await tx.authorizationRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      if (!canResolveRequest(current.status)) {
        throw new ConflictException('La solicitud ya fue resuelta.');
      }
      const order = await tx.order.findUniqueOrThrow({ where: { id: current.orderId } });

      let authorization: OrderAuthorization | null = null;
      if (decision === 'approved') {
        if (current.type === 'additional_work' && !canApproveAdditionalWork(order.status)) {
          throw new ConflictException(
            'La orden está finalizada: no se agregan trabajos nuevos (§20.1).',
          );
        }
        let jobId: string | null = null;
        if (current.type === 'additional_work') {
          // Decision 5 (§8.4, §9): approval adds the job to the SAME order,
          // pending and unassigned; the originator assigns it afterwards.
          const maxSort = await tx.job.aggregate({
            where: { orderId: order.id },
            _max: { sortOrder: true },
          });
          const job = await tx.job.create({
            data: {
              orderId: order.id,
              companyId: order.companyId,
              title: 'Trabajo adicional',
              description: current.description,
              sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
            },
          });
          jobId = job.id;
        }
        authorization = await tx.orderAuthorization.create({
          data: {
            orderId: order.id,
            type: current.type,
            source: 'platform_request',
            grantedByUserId: auth.userId,
            grantedAt: new Date(),
            authorizedByUserId: auth.userId,
            amountCap: decimalString(current.requestedAmount),
            description: current.description,
            authorizationRequestId: current.id,
            jobId,
          },
        });
        await tx.authorizationRequest.update({
          where: { id: current.id },
          data: {
            status: 'approved',
            resolvedByUserId: auth.userId,
            resolvedAt: new Date(),
            authorizationId: authorization.id,
          },
        });
      } else {
        await tx.authorizationRequest.update({
          where: { id: current.id },
          data: {
            status: 'rejected',
            resolvedByUserId: auth.userId,
            resolvedAt: new Date(),
            resolutionNote: note,
          },
        });
      }

      await this.audit.record(
        {
          companyId: order.companyId,
          actorUserId: auth.userId,
          action:
            decision === 'approved'
              ? AUDIT_ACTIONS_ETAPA4.AUTHORIZATION_APPROVED
              : AUDIT_ACTIONS_ETAPA4.AUTHORIZATION_REJECTED,
          entityType: AUDIT_ENTITIES_ETAPA4.AUTHORIZATION_REQUEST,
          entityId: current.id,
          payload: {
            orderId: order.id,
            type: current.type,
            ...(authorization ? { authorizationId: authorization.id, jobId: authorization.jobId } : {}),
          },
        },
        tx,
      );

      return { request: current, order, authorization };
    });
  }

  /** Email recipient on the originating side (§14.1): the order's
   * originator, falling back to an owner of the company. */
  /** Originator contact for authorization notices (§14.1, D6). */
  private async originatorContact(
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

  private serializeAuthorization(
    authorization: OrderAuthorization,
    party: 'owner' | 'assignee',
  ) {
    const base = {
      id: authorization.id,
      orderId: authorization.orderId,
      type: authorization.type,
      source: authorization.source,
      amountCap: fromCents(nullableToCents(decimalString(authorization.amountCap))),
      grantedAt: authorization.grantedAt.toISOString(),
      createdAt: authorization.createdAt.toISOString(),
    };
    if (party === 'assignee') return base;
    return {
      ...base,
      grantedByUserId: authorization.grantedByUserId,
      grantedByDescription: authorization.grantedByDescription,
      authorizedByUserId: authorization.authorizedByUserId,
      description: authorization.description,
      authorizationRequestId: authorization.authorizationRequestId,
      jobId: authorization.jobId,
    };
  }
}

/** Sum of item amounts (Decimal) as integer cents. */
function centsOfTotal(items: ReadonlyArray<{ amount: Prisma.Decimal }>): number {
  return items.reduce((sum, item) => sum + (nullableToCents(item.amount.toFixed(2)) ?? 0), 0);
}
