import { Module } from '@nestjs/common';
import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Cost reports per assignment (spec etapa-4.md §4.3, §8.1–§8.3): draft →
 * submit → versioned corrections, with email notifications (§14.1). Imports
 * the billing module to notify invoice parties of corrections (etapa-5 D9)
 * and the notifications module for the per-user email gate (etapa-6 D6).
 */
@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [CostsController],
  providers: [CostsService],
})
export class CostsModule {}
