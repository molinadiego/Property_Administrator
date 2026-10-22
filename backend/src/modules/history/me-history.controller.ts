import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthContext } from '../../common/request-context';
import { JobHistoryListViewDto } from './dto/history-responses.dto';
import { HistoryService } from './history.service';

/**
 * Session-scoped personal history (spec etapa-3.md §4.5): no company route —
 * only the caller's own jobs, from any company they ever worked in (§7.3).
 */
@ApiTags('history')
@Controller('me/job-history')
export class MeHistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @ApiOperation({ summary: 'Historial propio de trabajos: solo los tuyos, incluso cerrados (§7.2)' })
  @ApiResponse({ status: 200, description: 'Trabajos propios con orden, propiedad, fechas y motivos', type: JobHistoryListViewDto })
  myJobHistory(@CurrentUser() auth: AuthContext) {
    return this.historyService.myJobHistory(auth);
  }
}
