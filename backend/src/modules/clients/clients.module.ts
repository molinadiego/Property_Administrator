import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

/**
 * Own clients of a professional (spec etapa-2.md §2.3, §4.3, §5.1).
 */
@Module({
  imports: [PropertiesModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
