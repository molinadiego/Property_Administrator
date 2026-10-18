import { Module } from '@nestjs/common';
import { LimitedAccessGuard } from '../../common/guards/limited-access.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { LimitedController } from './limited.controller';
import { LimitedAccessService } from './limited.service';

/**
 * Limited-access accounts (spec etapa-2.md §4.4, approved token decision §3):
 * opaque token routes plus the `requested` → `open` conversion by company
 * users (§5.1).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [LimitedController],
  providers: [LimitedAccessService, LimitedAccessGuard],
})
export class LimitedModule {}
