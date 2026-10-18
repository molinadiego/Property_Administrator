import { Module } from '@nestjs/common';
import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';

/**
 * Cost reports per assignment (spec etapa-4.md §4.3, §8.1–§8.3): draft →
 * submit → versioned corrections, with email notifications (§14.1).
 */
@Module({
  controllers: [CostsController],
  providers: [CostsService],
})
export class CostsModule {}
