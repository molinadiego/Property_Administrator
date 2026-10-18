import { Module } from '@nestjs/common';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { MeHistoryController } from './me-history.controller';

/**
 * Property, company and personal histories plus antecedent shares
 * (spec etapa-3.md §4.5–§4.6, proyect.md §7.2–§7.5).
 */
@Module({
  controllers: [HistoryController, MeHistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
