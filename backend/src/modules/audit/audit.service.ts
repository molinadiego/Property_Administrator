import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log.query.dto';
import { decodeCursor, encodeCursor } from '../../common/pagination';

export interface AuditEntryInput {
  companyId?: string | null;
  actorType?: 'user' | 'system';
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  /** Detail of the change (before/after where applicable). Never secrets. */
  payload?: Prisma.InputJsonValue;
}

export interface AuditPage {
  data: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorType: string;
    actorUserId: string | null;
    payload: unknown;
    createdAt: string;
  }>;
  nextCursor: string | null;
}

/**
 * Audit log service (spec etapa-1.md §2.6): append-only. The runtime DB role
 * has no UPDATE/DELETE grants on audit_log, and this service only exposes
 * create + read.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appends one entry. Pass `tx` to record inside the caller's transaction. */
  async record(entry: AuditEntryInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        companyId: entry.companyId ?? null,
        actorType: entry.actorType ?? 'user',
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        payload: entry.payload ?? Prisma.DbNull,
      },
    });
  }

  /** Company-scoped history, newest first, cursor-paginated (spec §4.4). */
  async listCompanyEntries(companyId: string, query: AuditLogQueryDto): Promise<AuditPage> {
    const limit = query.limit ?? 50;
    const filters: Prisma.AuditLogWhereInput[] = [{ companyId }];
    if (query.action) filters.push({ action: query.action });
    if (query.entity_type) filters.push({ entityType: query.entity_type });
    if (query.from || query.to) {
      filters.push({
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) {
        throw new UnprocessableEntityException('Cursor de paginación inválido.');
      }
      filters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.auditLog.findMany({
      where: { AND: filters },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actorType: row.actorType,
        actorUserId: row.actorUserId,
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}
