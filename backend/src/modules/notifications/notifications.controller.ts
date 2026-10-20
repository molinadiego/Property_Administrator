import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.query.dto';
import { AuthContext } from '../../common/request-context';
import { NotificationListViewDto } from './dto/notifications-responses.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notificaciones in-app del usuario autenticado' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista paginada', type: NotificationListViewDto })
  listMine(@CurrentUser() auth: AuthContext, @Query() query: PaginationQueryDto) {
    return this.notificationsService.listMine(auth.userId, query);
  }

  @Post(':notifId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'notifId', description: 'Identificador de la notificación' })
  @ApiOperation({ summary: 'Marca una notificación como leída' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Marcada como leída' })
  async markRead(@CurrentUser() auth: AuthContext, @Param('notifId') notifId: string) {
    await this.notificationsService.markRead(auth.userId, notifId);
  }
}
