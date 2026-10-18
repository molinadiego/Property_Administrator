import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FileObject, FileTargetType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS_ETAPA3, AUDIT_ENTITIES_ETAPA3 } from '../audit/audit-actions';
import { StorageService } from '../storage/storage.service';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import {
  isAllowedContentType,
  isAllowedSize,
  sanitizeFilename,
} from './file-rules';

/** File metadata as returned by the API (spec etapa-3.md §4.4). */
export interface FileMetadata {
  id: string;
  orderId: string;
  targetType: FileTargetType;
  targetId: string;
  kind: 'photo' | 'document';
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface DownloadedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function toMetadata(file: FileObject): FileMetadata {
  return {
    id: file.id,
    orderId: file.orderId,
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
 * Photos and documents (spec etapa-3.md §4.4, §6, §7.6). Bytes go through
 * `StorageService`; this service owns permissions, the allowlist (§11) and the
 * logical delete (§1.1.8). Motives and filenames never reach the audit log or
 * the application logs (§16.4).
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** Uploads a file to an order (§4.4): owning member or active assignee. */
  async uploadToOrder(
    access: CompanyAccess,
    auth: AuthContext,
    orderId: string,
    file: Express.Multer.File | undefined,
    kind?: 'photo' | 'document',
  ): Promise<FileMetadata> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    await this.assertOrderContributor(order, access, auth);
    return this.store(file, kind, order.companyId, {
      targetType: 'order',
      targetId: order.id,
      orderId: order.id,
    }, auth);
  }

  /** Uploads evidence to a job (§4.4): owning member or its active assignee. */
  async uploadToJob(
    access: CompanyAccess,
    auth: AuthContext,
    jobId: string,
    file: Express.Multer.File | undefined,
    kind?: 'photo' | 'document',
  ): Promise<FileMetadata> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    await this.assertJobContributor(job, access, auth);
    return this.store(file, kind, job.companyId, {
      targetType: 'job',
      targetId: job.id,
      orderId: job.orderId,
    }, auth);
  }

  /**
   * Lists the metadata visible for an order (§4.4): the owning company sees
   * every file; an active assignee sees order-level files plus the files of
   * **their** jobs (§16.3: another professional's evidence is not theirs).
   */
  async listOrderFiles(
    access: CompanyAccess,
    auth: AuthContext,
    orderId: string,
  ): Promise<{ data: FileMetadata[] }> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada.');

    const membershipIds = await this.activeMembershipIds(auth.userId);
    const isOwnerMember = await this.isMemberOf(order.companyId, auth.userId);

    let files: FileObject[];
    if (isOwnerMember) {
      files = await this.prisma.fileObject.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      const activeJobs = await this.prisma.assignment.findMany({
        where: {
          job: { orderId: order.id },
          assigneeMembershipId: { in: membershipIds },
          status: { in: ['pending', 'accepted'] },
        },
        select: { jobId: true },
      });
      if (activeJobs.length === 0) {
        await this.denyOrLeak(order, access);
      }
      const jobIds = activeJobs.map((a) => a.jobId);
      files = await this.prisma.fileObject.findMany({
        where: {
          orderId: order.id,
          OR: [{ targetType: 'order' }, { targetType: 'job', targetId: { in: jobIds } }],
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return { data: files.map(toMetadata) };
  }

  /** Streams the bytes of a file (§4.4): owner, assignee in scope, or share. */
  async download(auth: AuthContext, fileId: string): Promise<DownloadedFile> {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
      include: { order: { select: { companyId: true, propertyId: true } } },
    });
    if (!file || file.deletedAt) throw new NotFoundException('Archivo no encontrado.');
    await this.assertCanDownload(file, auth);

    let buffer: Buffer;
    try {
      buffer = await this.storage.get(file.storageKey);
    } catch {
      // §11: storage fault is a backend failure, reported as retryable.
      throw new ServiceUnavailableException('Almacenamiento de archivos no disponible, reintenta más tarde.');
    }
    return { buffer, contentType: file.contentType, filename: file.filename };
  }

  /** Logical delete (§1.1.8): the row is kept, the removal is audited. */
  async remove(access: CompanyAccess, auth: AuthContext, fileId: string): Promise<void> {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
      include: { order: { select: { companyId: true } } },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado.');
    if (file.deletedAt) return; // idempotent

    const isMember = await this.isMemberOf(file.companyId, auth.userId);
    if (!isMember && file.uploadedBy !== auth.userId) {
      await this.denyOrLeak({ companyId: file.companyId, id: file.orderId }, access);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.fileObject.update({
        where: { id: file.id },
        data: { deletedAt: new Date() },
      });
      await this.audit.record(
        {
          companyId: file.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA3.FILE_DELETED,
          entityType: AUDIT_ENTITIES_ETAPA3.FILE,
          entityId: file.id,
          payload: {
            fileId: file.id,
            targetType: file.targetType,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
          },
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Validates, writes to storage and records the row (spec §11). */
  private async store(
    file: Express.Multer.File | undefined,
    kind: 'photo' | 'document' | undefined,
    companyId: string,
    target: { targetType: FileTargetType; targetId: string; orderId: string },
    auth: AuthContext,
  ): Promise<FileMetadata> {
    if (!file) {
      throw new UnprocessableEntityException('Falta el archivo en el campo multipart "file".');
    }
    if (!isAllowedContentType(file.mimetype)) {
      throw new UnsupportedMediaTypeException(`Tipo de archivo no permitido: ${file.mimetype}.`);
    }
    if (!isAllowedSize(file.size)) {
      throw new UnprocessableEntityException('El archivo supera el máximo permitido de 10 MB.');
    }

    const filename = sanitizeFilename(file.originalname);
    // The storage key is a generated UUID: user input never shapes it (§11).
    const storageKey = `files/${randomUUID()}`;
    try {
      await this.storage.put(storageKey, file.buffer, file.mimetype);
    } catch {
      throw new ServiceUnavailableException(
        'Almacenamiento de archivos no disponible, reintenta más tarde.',
      );
    }

    let row: FileObject;
    try {
      row = await this.prisma.fileObject.create({
        data: {
          companyId,
          orderId: target.orderId,
          targetType: target.targetType,
          targetId: target.targetId,
          kind: kind ?? 'document',
          filename,
          contentType: file.mimetype,
          sizeBytes: file.size,
          storageKey,
          uploadedBy: auth.userId,
        },
      });
    } catch (error) {
      // §11: if the row fails after the bytes landed, roll the object back.
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }

    await this.audit.record({
      companyId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS_ETAPA3.FILE_UPLOADED,
      entityType: AUDIT_ENTITIES_ETAPA3.FILE,
      entityId: row.id,
      // ids, type and size only — never the filename (§16.4).
      payload: {
        fileId: row.id,
        targetType: row.targetType,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
      },
    });
    return toMetadata(row);
  }

  /** Order upload/list permission (§4.4): member or active assignee. */
  private async assertOrderContributor(
    order: { id: string; companyId: string },
    access: CompanyAccess,
    auth: AuthContext,
  ): Promise<void> {
    const membershipIds = await this.activeMembershipIds(auth.userId);
    const active = await this.prisma.assignment.findFirst({
      where: {
        job: { orderId: order.id },
        assigneeMembershipId: { in: membershipIds },
        status: { in: ['pending', 'accepted'] },
      },
    });
    if (active) return;
    if (await this.isMemberOf(order.companyId, auth.userId)) return;
    await this.denyOrLeak(order, access);
  }

  /** Job upload permission (§4.4): member or the job's own active assignee. */
  private async assertJobContributor(
    job: { id: string; companyId: string; orderId: string },
    access: CompanyAccess,
    auth: AuthContext,
  ): Promise<void> {
    const membershipIds = await this.activeMembershipIds(auth.userId);
    const active = await this.prisma.assignment.findFirst({
      where: {
        jobId: job.id,
        assigneeMembershipId: { in: membershipIds },
        status: { in: ['pending', 'accepted'] },
      },
    });
    if (active) return;
    if (await this.isMemberOf(job.companyId, auth.userId)) return;
    await this.denyOrLeak({ id: job.orderId, companyId: job.companyId }, access);
  }

  /** Download permission (§4.4): owner, assignee in scope, or active share. */
  private async assertCanDownload(
    file: FileObject & { order: { companyId: string; propertyId: string } },
    auth: AuthContext,
  ): Promise<void> {
    if (await this.isMemberOf(file.order.companyId, auth.userId)) return;

    const membershipIds = await this.activeMembershipIds(auth.userId);
    const assignmentScope =
      file.targetType === 'job'
        ? { jobId: file.targetId }
        : { job: { orderId: file.orderId } };
    const active = await this.prisma.assignment.findFirst({
      where: {
        ...assignmentScope,
        assigneeMembershipId: { in: membershipIds },
        status: { in: ['pending', 'accepted'] },
      },
    });
    if (active) return;

    const share = await this.prisma.historyShare.findFirst({
      where: {
        propertyId: file.order.propertyId,
        companyId: file.companyId,
        sharedWithMembershipId: { in: membershipIds },
        revokedAt: null,
      },
    });
    if (share) return;

    // Out of scope: existence is never leaked (matrix #36, §16.8).
    throw new NotFoundException('Archivo no encontrado.');
  }

  /** §16.8: related company 403, unrelated 404 — no existence leak. */
  private async denyOrLeak(
    order: { id: string; companyId: string },
    access: CompanyAccess,
  ): Promise<never> {
    const related = await this.prisma.assignment.findFirst({
      where: {
        job: { orderId: order.id },
        assigneeMembership: { companyId: access.companyId },
      },
    });
    if (related) {
      throw new ForbiddenException('No tienes acceso a los archivos de esta orden.');
    }
    throw new NotFoundException('Orden no encontrada.');
  }

  private async activeMembershipIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'active' },
      select: { id: true },
    });
    return memberships.map((m) => m.id);
  }

  private async isMemberOf(companyId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: { companyId, userId, status: 'active' },
      select: { id: true },
    });
    return membership !== null;
  }
}
