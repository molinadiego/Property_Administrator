import { Global, Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';

/**
 * Memberships: user ↔ company ↔ role, access revocation.
 * Implemented in Etapa 1 (docs/especificacion/etapa-1.md).
 */
@Global()
@Module({
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
