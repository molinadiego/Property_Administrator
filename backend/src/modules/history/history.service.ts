import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FileKind, FileTargetType, Job, JobEventType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS_ETAPA3, AUDIT_ENTITIES_ETAPA3 } from '../audit/audit-actions';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { propertyHistoryScope } from './history-rules';
import { CreateShareDto } from './dto/create-share.dto';

/** Job event projection used by every history payload (§7.2–§7.4). */
type JobEventBrief = Array<{ type: JobEventType; message: string | null }>;

type JobWithEvents = Job & { jobEvents: JobEventBrief };

const JOB_EVENT_HISTORY_FILTER: Prisma.JobEventWhereInput = {
  type: { in: ['completed', 'incomplete', 'not_realized'] },
};

/**
 * Free progress notes (§6.1) are deliberately excluded from every history
 * payload: they are the professional's private working notes (§7.5); only the
 * final result and the reasons are antecedents.
 */
function toJobEntry(job: JobWithEvents) {
  const newestFirst = [...job.jobEvents].reverse();
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    result: newestFirst.find((e) => e.type === 'completed')?.message ?? null,
    reason: newestFirst.find((e) => e.type === 'incomplete' || e.type === 'not_realized')?.message ?? null,
  };
}

function toFileEntry(file: {
  id: string;
  targetType: FileTargetType;
  targetId: string;
  kind: FileKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: file.id,
    targetType: file.targetType,
    targetId: file.targetId,
    kind: file.kind,
    filename: file.filename,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt.toISOString(),
    deletedAt: file.deletedAt ? file.deletedAt.toISOString() : null,
  };
}

/**
 * Property, company and personal histories plus explicit antecedent shares
 * (docs/especificacion/etapa-3.md §4.5–§4.6, §5 rules 8-9, proyect.md §7.2–§7.5).
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Property history (§7.2): owning company sees everything; an active share
   * sees the shared antecedents; an active assignment without a share sees
   * **only its own jobs** (matriz #39–#41).
   */
  async propertyHistory(access: CompanyAccess, auth: AuthContext, propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Propiedad no encontrada.');

    const membershipIds = await this.activeMembershipIds(auth.userId);
    const [share, activeAssignment] = await Promise.all([
      this.prisma.historyShare.findFirst({
        where: {
          propertyId: property.id,
          companyId: property.companyId,
          sharedWithMembershipId: { in: membershipIds },
          revokedAt: null,
        },
        select: { id: true },
      }),
      this.prisma.assignment.findFirst({
        where: {
          job: { order: { propertyId: property.id } },
          assigneeMembershipId: { in: membershipIds },
          status: { in: ['pending', 'accepted'] },
        },
        select: { id: true },
      }),
    ]);

    const scope = propertyHistoryScope({
      propertyCompanyId: property.companyId,
      callerCompanyId: access.companyId,
      hasActiveShare: share !== null,
      hasActiveAssignment: activeAssignment !== null,
    });
    if (scope === 'none') throw new NotFoundException('Propiedad no encontrada.');

    const ownJobFilter: Prisma.JobWhereInput =
      scope === 'own_jobs'
        ? { assignments: { some: { assigneeMembership: { userId: auth.userId } } } }
        : {};

    const orders = await this.prisma.order.findMany({
      where: { propertyId: property.id },
      include: {
        jobs: {
          where: ownJobFilter,
          include: {
            jobEvents: {
              where: JOB_EVENT_HISTORY_FILTER,
              orderBy: { createdAt: 'asc' },
              select: { type: true, message: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        files: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const ownJobIds = new Set(orders.flatMap((o) => o.jobs.map((j) => j.id)));

    return {
      property: {
        id: property.id,
        addressLine: property.addressLine,
        city: property.city,
        state: property.state,
      },
      orders: orders
        // `own_jobs`: an order with none of the caller's jobs shows nothing.
        .filter((order) => scope !== 'own_jobs' || order.jobs.length > 0)
        .map((order) => ({
          id: order.id,
          title: order.title,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          closedAt: order.closedAt ? order.closedAt.toISOString() : null,
          parentOrderId: order.parentOrderId,
          jobs: order.jobs.map(toJobEntry),
          files: order.files
            .filter(
              (file) =>
                scope !== 'own_jobs' ||
                file.targetType === 'order' ||
                ownJobIds.has(file.targetId),
            )
            .map(toFileEntry),
        })),
    };
  }

  /**
   * Orders the space managed (§7.3, §7.4): its own plus every order it ever
   * held an assignment on — any assignment status, including closed orders.
   */
  async managedOrders(access: CompanyAccess) {
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { companyId: access.companyId },
          {
            jobs: {
              some: { assignments: { some: { assigneeMembership: { companyId: access.companyId } } } },
            },
          },
        ],
      },
      include: {
        property: { select: { id: true, addressLine: true, city: true } },
        jobs: {
          include: {
            jobEvents: {
              where: JOB_EVENT_HISTORY_FILTER,
              orderBy: { createdAt: 'asc' },
              select: { type: true, message: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: orders.map((order) => ({
        id: order.id,
        title: order.title,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        closedAt: order.closedAt ? order.closedAt.toISOString() : null,
        property: order.property,
        jobs: order.jobs.map(toJobEntry),
      })),
    };
  }

  /**
   * The caller's own job history (§7.2): every job they ever held, even in
   * companies where the membership was later revoked, even when the job is
   * closed. Session-scoped: no company route, no foreign jobs (§7.3).
   */
  async myJobHistory(auth: AuthContext) {
    const jobs = await this.prisma.job.findMany({
      where: { assignments: { some: { assigneeMembership: { userId: auth.userId } } } },
      include: {
        order: {
          select: {
            id: true,
            title: true,
            status: true,
            property: { select: { addressLine: true, city: true } },
          },
        },
        jobEvents: {
          where: JOB_EVENT_HISTORY_FILTER,
          orderBy: { createdAt: 'asc' },
          select: { type: true, message: true },
        },
        assignments: {
          where: { assigneeMembership: { userId: auth.userId } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      data: jobs.map((job) => ({
        ...toJobEntry(job),
        assignmentStatus: job.assignments[0]?.status ?? null,
        order: {
          id: job.order.id,
          title: job.order.title,
          status: job.order.status,
        },
        property: job.order.property,
      })),
    };
  }

  /** Shares antecedents of one of the company's properties (§7.5, matriz #44–#46). */
  async createShare(access: CompanyAccess, auth: AuthContext, dto: CreateShareDto) {
    const property = await this.prisma.property.findUnique({ where: { id: dto.propertyId } });
    if (!property) throw new NotFoundException('Propiedad no encontrada.');
    // Only the owner of the records can share them (§7.5, matriz #45); foreign
    // properties are never confirmed to exist (§16.8).
    if (property.companyId !== access.companyId) {
      throw new NotFoundException('Propiedad no encontrada.');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: dto.sharedWithMembershipId },
    });
    if (!membership) throw new NotFoundException('Membresía destino no encontrada.');
    if (membership.status !== 'active') {
      throw new UnprocessableEntityException('La membresía destino no está activa.');
    }

    const duplicate = await this.prisma.historyShare.findFirst({
      where: {
        propertyId: property.id,
        sharedWithMembershipId: membership.id,
        revokedAt: null,
      },
    });
    if (duplicate) throw new ConflictException('Ya existe un share activo para esa membresía.');

    const share = await this.prisma.$transaction(async (tx) => {
      const created = await tx.historyShare.create({
        data: {
          companyId: access.companyId,
          propertyId: property.id,
          sharedWithMembershipId: membership.id,
          sharedBy: auth.userId,
          note: dto.note ?? null,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.HISTORY_SHARE_CREATED,
          entityType: AUDIT_ENTITIES_ETAPA3.HISTORY_SHARE,
          entityId: created.id,
          payload: { propertyId: property.id, sharedWithMembershipId: membership.id },
        },
        tx,
      );
      return created;
    });

    return {
      id: share.id,
      propertyId: share.propertyId,
      sharedWithMembershipId: share.sharedWithMembershipId,
      createdAt: share.createdAt.toISOString(),
    };
  }

  /** Revokes a share (`revoked_at`, §7.5, matriz #47): the benefit ends now. */
  async revokeShare(access: CompanyAccess, auth: AuthContext, shareId: string) {
    const share = await this.prisma.historyShare.findUnique({ where: { id: shareId } });
    // Only the granting company manages its shares; others never see it.
    if (!share || share.companyId !== access.companyId) {
      throw new NotFoundException('Share no encontrado.');
    }
    if (share.revokedAt) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.historyShare.update({
        where: { id: share.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          companyId: share.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.HISTORY_SHARE_REVOKED,
          entityType: AUDIT_ENTITIES_ETAPA3.HISTORY_SHARE,
          entityId: share.id,
          payload: { propertyId: share.propertyId, sharedWithMembershipId: share.sharedWithMembershipId },
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async activeMembershipIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'active' },
      select: { id: true },
    });
    return memberships.map((m) => m.id);
  }
}
