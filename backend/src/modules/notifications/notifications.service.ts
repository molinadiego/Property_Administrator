import { Injectable } from '@nestjs/common';
import { NotificationType } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../../common/pagination';

export interface NotificationPage {
  data: Array<{
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    entityType: string;
    entityId: string;
    link: string | null;
    readAt: string | null;
    createdAt: string;
    /** Space the notification belongs to (§2.4; frontend F2-D5 filters by it). */
    companyId: string;
  }>;
  nextCursor: string | null;
}

/**
 * In-app notifications (spec etapa-2.md §2.9). The events produced in this
 * stage are assignment lifecycle ones (§7); email stays out of the flow until
 * Resend is provisioned. Scoped strictly to the recipient user (§16.8).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appends one notification for a user. Pass `tx` to join a transaction. */
  async notify(
    data: {
      userId: string;
      companyId: string;
      type: NotificationType;
      title: string;
      body: string;
      entityType: string;
      entityId: string;
      link?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.notification.create({ data });
  }

  /** Recipient's notifications, newest first, cursor-paginated. */
  async listMine(
    userId: string,
    query: { limit?: number; cursor?: string },
  ): Promise<NotificationPage> {
    const limit = query.limit ?? 50;
    const filters: Prisma.NotificationWhereInput[] = [{ userId }];
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) {
        return { data: [], nextCursor: null };
      }
      filters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.notification.findMany({
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
        type: row.type,
        title: row.title,
        body: row.body,
        entityType: row.entityType,
        entityId: row.entityId,
        link: row.link,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        companyId: row.companyId,
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /** Marks one of the user's notifications as read (idempotent). */
  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
