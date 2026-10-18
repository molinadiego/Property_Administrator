import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Subscription plans per company category (spec etapa-6.md §4.4, §15,
 * §18.3): read-only catalog plus the company's effective plan. Billing
 * stays outside the system; nothing is enforced in v1 (D3/D4).
 */
@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
