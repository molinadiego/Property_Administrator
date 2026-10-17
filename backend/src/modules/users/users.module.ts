import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * User accounts (personal identity, shared across companies).
 * Implemented in Etapa 1 (docs/especificacion/etapa-1.md).
 */
@Global()
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
