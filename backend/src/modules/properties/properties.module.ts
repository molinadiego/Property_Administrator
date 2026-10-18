import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';

/**
 * Properties and their tenants (spec etapa-2.md §2.2–§2.4, §4.1–§4.5).
 */
@Module({
  imports: [EmailModule],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
