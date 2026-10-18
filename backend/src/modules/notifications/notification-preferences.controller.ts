import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthContext } from '../../common/request-context';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

/**
 * Per-user notice preferences (spec etapa-6.md §4.3, §18.4). The route is
 * user-scoped, not company-nested: preferences are personal and act only
 * on the session user (§5, rule 5).
 */
@ApiTags('notification-preferences')
@Controller('me/notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Preferencias de correo por tipo de aviso del usuario (§18.4)' })
  @ApiResponse({ status: 200, description: 'Todos los tipos con su flag de correo (default true)' })
  listMine(@CurrentUser() auth: AuthContext) {
    return this.preferences.listMine(auth.userId);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualiza las preferencias de correo del usuario (§18.4)' })
  @ApiResponse({ status: 200, description: 'Preferencias aplicadas' })
  @ApiResponse({ status: 401, description: 'Sin sesión (401)' })
  @ApiResponse({ status: 422, description: 'Tipo desconocido o payload inválido (422)' })
  updateMine(@CurrentUser() auth: AuthContext, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.preferences.updateMine(auth.userId, dto);
  }
}
