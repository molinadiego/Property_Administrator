import { Module } from '@nestjs/common';
import { AuthorizationsController } from './authorizations.controller';
import { AuthorizationsService } from './authorizations.service';

/**
 * Authorization requests, off-platform constancias (§18.1) and the economic
 * summary of an order (spec etapa-4.md §4.4–§4.6, §8.4–§8.7, §9).
 */
@Module({
  controllers: [AuthorizationsController],
  providers: [AuthorizationsService],
})
export class AuthorizationsModule {}
