import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AUDIT_ACTIONS_ETAPA6,
  AUDIT_ENTITIES_ETAPA6,
} from '../audit/audit-actions';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { CreateWarrantyClaimDto } from './dto/create-warranty-claim.dto';
import { ResolveWarrantyClaimDto } from './dto/resolve-warranty-claim.dto';

/**
 * Warranty claims over a completed repair (spec etapa-6.md §4.1, §13).
 *
 * Visibility (§13, D5): a claim is started and managed only by the
 * originating company of the original order, inside its own space; every
 * other company gets 404 (§16.8). A claim never creates orders nor
 * authorizations (§13): coverage is not implied and no work is authorized.
 * The repair history is not duplicated — the claim links the original
 * order, job, costs and files (§13); it is immutable except its resolution.
 */
@Injectable()
export class WarrantyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Creates a claim over a `done` job of the company's own order (§13). */
  async create(access: CompanyAccess, auth: AuthContext, orderId: string, dto: CreateWarrantyClaimDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, companyId: access.companyId },
    });
    if (!order) throw new NotFoundException('Orden no encontrada.');

    const job = await this.prisma.job.findFirst({ where: { id: dto.jobId, orderId } });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    if (job.status !== 'done') {
      throw new UnprocessableEntityException(
        'El trabajo debe estar Completado para reclamar garantía (§13, §20.2).',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.warrantyClaim.create({
        data: {
          companyId: access.companyId,
          orderId,
          jobId: job.id,
          description: dto.description.trim(),
          createdBy: auth.userId,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA6.WARRANTY_CLAIM_CREATED,
          entityType: AUDIT_ENTITIES_ETAPA6.WARRANTY_CLAIM,
          entityId: claim.id,
          payload: { orderId, jobId: job.id },
        },
        tx,
      );
      return claim;
    });

    return this.serialize(created);
  }

  /** Claims of one order of the company, newest first (§13). */
  async list(access: CompanyAccess, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, companyId: access.companyId },
    });
    if (!order) throw new NotFoundException('Orden no encontrada.');

    const rows = await this.prisma.warrantyClaim.findMany({
      where: { companyId: access.companyId, orderId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows.map((row) => this.serialize(row)) };
  }

  /**
   * Claim detail with the preserved repair context (§13): the original
   * order, the job with its professional, the cost reports and the file
   * count — all read from the existing records, never copied.
   */
  async getDetail(access: CompanyAccess, claimId: string) {
    const claim = await this.prisma.warrantyClaim.findFirst({
      where: { id: claimId, companyId: access.companyId },
      include: {
        order: { select: { id: true, title: true, status: true, createdAt: true } },
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            startedAt: true,
            completedAt: true,
            assignments: {
              where: { status: 'accepted' },
              select: {
                assigneeMembership: { select: { user: { select: { name: true } } } },
                costReports: {
                  select: { id: true, version: true, status: true, total: true, submittedAt: true },
                },
              },
            },
          },
        },
      },
    });
    if (!claim) throw new NotFoundException('Reclamo no encontrado.');

    const fileCount = await this.prisma.fileObject.count({
      where: { targetType: 'job', targetId: claim.jobId, deletedAt: null },
    });

    const accepted = claim.job.assignments[0] ?? null;
    return {
      ...this.serialize(claim),
      order: claim.order,
      job: {
        id: claim.job.id,
        title: claim.job.title,
        status: claim.job.status,
        startedAt: claim.job.startedAt?.toISOString() ?? null,
        completedAt: claim.job.completedAt?.toISOString() ?? null,
        professionalName: accepted?.assigneeMembership.user.name ?? null,
        costReports: accepted?.costReports ?? [],
        fileCount,
      },
    };
  }

  /** Resolves an open claim with its resolution note (§13, AC-6.4). */
  async resolve(access: CompanyAccess, auth: AuthContext, claimId: string, dto: ResolveWarrantyClaimDto) {
    const claim = await this.prisma.warrantyClaim.findFirst({
      where: { id: claimId, companyId: access.companyId },
    });
    if (!claim) throw new NotFoundException('Reclamo no encontrado.');

    const resolved = await this.prisma.$transaction(async (tx) => {
      // Atomic transition: a concurrent resolve loses with 409 (spec §11.1).
      const updated = await tx.warrantyClaim.updateMany({
        where: { id: claimId, status: 'open' },
        data: {
          status: 'resolved',
          resolution: dto.resolution.trim(),
          resolvedAt: new Date(),
          resolvedByUserId: auth.userId,
        },
      });
      if (updated.count === 0) throw new ConflictException('El reclamo ya fue resuelto.');
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA6.WARRANTY_CLAIM_RESOLVED,
          entityType: AUDIT_ENTITIES_ETAPA6.WARRANTY_CLAIM,
          entityId: claimId,
          payload: { orderId: claim.orderId, jobId: claim.jobId },
        },
        tx,
      );
      return tx.warrantyClaim.findUniqueOrThrow({ where: { id: claimId } });
    });

    return this.serialize(resolved);
  }

  private serialize(claim: {
    id: string;
    orderId: string;
    jobId: string;
    description: string;
    status: string;
    resolution: string | null;
    resolvedAt: Date | null;
    resolvedByUserId: string | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: claim.id,
      orderId: claim.orderId,
      jobId: claim.jobId,
      description: claim.description,
      status: claim.status,
      resolution: claim.resolution,
      resolvedAt: claim.resolvedAt?.toISOString() ?? null,
      resolvedByUserId: claim.resolvedByUserId,
      createdBy: claim.createdBy,
      createdAt: claim.createdAt.toISOString(),
      updatedAt: claim.updatedAt.toISOString(),
    };
  }
}
