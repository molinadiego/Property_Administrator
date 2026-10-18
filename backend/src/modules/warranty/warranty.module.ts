import { Module } from '@nestjs/common';
import { WarrantyController } from './warranty.controller';
import { WarrantyService } from './warranty.service';

/**
 * Warranty claims over completed repairs (spec etapa-6.md §4.1, §13).
 * Private to the originating company of the original order (D5).
 */
@Module({
  controllers: [WarrantyController],
  providers: [WarrantyService],
  exports: [WarrantyService],
})
export class WarrantyModule {}
