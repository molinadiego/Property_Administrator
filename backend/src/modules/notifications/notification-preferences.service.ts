import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTICE_TYPES, NoticeType, isNoticeType } from './notice-types';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

/**
 * Per-user email preferences for notices (spec etapa-6.md §4.3, §18.4).
 *
 * The in-app notification is never disabled (§18.4); a missing row means
 * email enabled (default). Preferences are personal to the session user:
 * there is no resource of another user to read or write (§5, rule 5).
 * Authentication emails are out of the toggle set (D6).
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every notice type with its current email flag (default true). */
  async listMine(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byType = new Map(rows.map((row) => [row.type, row.emailEnabled]));
    return {
      data: NOTICE_TYPES.map((type) => ({
        type,
        emailEnabled: byType.get(type) ?? true,
      })),
    };
  }

  /** Upserts the submitted flags; unknown types are rejected (422). */
  async updateMine(userId: string, dto: UpdateNotificationPreferencesDto) {
    for (const entry of dto.preferences) {
      if (!isNoticeType(entry.type)) {
        throw new UnprocessableEntityException(`Tipo de aviso desconocido: ${entry.type}.`);
      }
    }
    await this.prisma.$transaction(
      dto.preferences.map((entry) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_type: { userId, type: entry.type } },
          create: { userId, type: entry.type, emailEnabled: entry.emailEnabled },
          update: { emailEnabled: entry.emailEnabled },
        }),
      ),
    );
    return this.listMine(userId);
  }

  /** Email gate for a notice: absent row = enabled (§18.4 default). */
  async isEmailEnabled(userId: string, type: NoticeType): Promise<boolean> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });
    return row ? row.emailEnabled : true;
  }
}
