import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Audit log: append-only history of relevant actions (§12 of proyect.md).
 * No write endpoints exist beyond internal recording; DB grants block
 * UPDATE/DELETE (spec etapa-1.md §2.6, AC-4.3).
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
