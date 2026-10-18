import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NoticeType } from './notice-types';

/**
 * Email leg of the notification pipeline (spec etapa-6.md §4.2, §4.3).
 *
 * The in-app row is always created by `NotificationsService.notify`; this
 * service decides whether the same event also produces an email, per the
 * user's preferences (§18.4, D6). A provider failure is logged and never
 * breaks the business operation (§11.5, pattern from stages 2–5): the
 * in-app notification already persisted.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly preferences: NotificationPreferencesService,
    private readonly email: EmailService,
  ) {}

  /** Sends `message` unless the user disabled the email for `type`. */
  async sendNoticeIfEnabled(
    recipient: { userId: string; name?: string },
    type: NoticeType,
    message: { to: string; subject: string; text: string; html: string },
  ): Promise<void> {
    if (!(await this.preferences.isEmailEnabled(recipient.userId, type))) {
      return;
    }
    try {
      await this.email.sendNotice(message.to, {
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      this.logger.warn(
        `notice email failed (type=${type} user=${recipient.userId}): ${(error as Error).message}`,
      );
    }
  }
}
