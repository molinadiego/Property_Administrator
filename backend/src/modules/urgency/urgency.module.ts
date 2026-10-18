import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UrgencyController } from './urgency.controller';
import { UrgencyService } from './urgency.service';

/**
 * Urgent-order response window: settings, mid-window reminder and expiry
 * escalation (spec etapa-6.md §4.2, §14.2, §18.4, D1/D2/D7).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [UrgencyController],
  providers: [UrgencyService],
  exports: [UrgencyService],
})
export class UrgencyModule {}
