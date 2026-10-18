import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationDispatchService } from './notification-dispatch.service';

/**
 * In-app notifications (spec etapa-2 §2.9) plus the per-user email
 * preferences and the email dispatch leg of the pipeline (etapa-6 §4.3,
 * §18.4).
 */
@Module({
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationsService,
    NotificationPreferencesService,
    NotificationDispatchService,
  ],
  exports: [NotificationsService, NotificationPreferencesService, NotificationDispatchService],
})
export class NotificationsModule {}
