import { Module } from '@nestjs/common';
import { EconomicSettingsController } from './economic-settings.controller';
import { EconomicSettingsService } from './economic-settings.service';

/**
 * General economic policy, commercial relations and per-order economic policy
 * (spec etapa-4.md §4.1, §4.2, §4.7, §8.4–§8.6).
 */
@Module({
  controllers: [EconomicSettingsController],
  providers: [EconomicSettingsService],
  exports: [EconomicSettingsService],
})
export class EconomicSettingsModule {}
