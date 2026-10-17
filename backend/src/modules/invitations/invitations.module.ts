import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

/**
 * Invitations by email (token-based, scoped to one company and role).
 * Implemented in Etapa 1 (docs/especificacion/etapa-1.md).
 */
@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
