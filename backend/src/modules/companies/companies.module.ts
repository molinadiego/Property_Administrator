import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

/**
 * Companies / workspaces (tenant root, `company_id` scoping).
 * Implemented in Etapa 1 (docs/especificacion/etapa-1.md).
 */
@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
