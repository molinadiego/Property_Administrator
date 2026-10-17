import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { SESSION_COOKIE } from '../../common/guards/session.guard';
import { setSessionCookie } from '../../common/session-cookie';
import { AuthContext, AuthenticatedRequest, CompanyAccess } from '../../common/request-context';
import { SessionsService } from '../auth/sessions.service';
import { InvitationsService } from './invitations.service';
import { AcceptInvitationDto, CreateInvitationDto, ListInvitationsQueryDto } from './dto/create-invitation.dto';

@ApiTags('invitations')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly sessionsService: SessionsService,
    private readonly config: ConfigService,
  ) {}

  @Post('companies/:id/invitations')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiOperation({ summary: 'Crea una invitación y envía el email con el token (owner)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Invitación creada y email enviado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Rol insuficiente (403)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ya miembro o invitación pendiente (409)' })
  create(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(access.companyId, auth, dto);
  }

  @Get('companies/:id/invitations')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @ApiOperation({ summary: 'Lista de invitaciones del espacio, paginada por cursor (owner)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista paginada' })
  list(@CurrentCompany() access: CompanyAccess, @Query() query: ListInvitationsQueryDto) {
    return this.invitationsService.list(access.companyId, query);
  }

  @Delete('companies/:id/invitations/:invId')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoca una invitación pendiente (owner)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Invitación revocada' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No encontrada o no pendiente (404)' })
  async revoke(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('invId') invId: string,
  ) {
    await this.invitationsService.revoke(access.companyId, invId, auth);
  }

  @Public()
  @Get('invitations/:token')
  @ApiOperation({ summary: 'Previsualización pública: empresa y email enmascarado' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Datos públicos de la invitación' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Token inválido o revocado (404)' })
  @ApiResponse({ status: HttpStatus.GONE, description: 'Invitación expirada (410)' })
  preview(@Param('token') token: string) {
    return this.invitationsService.preview(token);
  }

  @Public()
  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Acepta la invitación: con sesión une esa cuenta; sin sesión crea la cuenta con {name, password}',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Invitación aceptada' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Token inválido o revocado (404)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ya miembro o invitación ya aceptada (409)' })
  @ApiResponse({ status: HttpStatus.GONE, description: 'Invitación expirada (410)' })
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req as AuthenticatedRequest).cookies ?? {};
    const auth = await this.sessionsService.resolveOptional(cookies[SESSION_COOKIE]);
    const result = await this.invitationsService.accept(token, auth, dto);

    // Account created by this accept: start its session right away.
    if (result.createdAccount) {
      const { token: sessionToken } = await this.sessionsService.create(result.userId, {
        ip: (req as AuthenticatedRequest).ip ?? req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      });
      setSessionCookie(res, sessionToken, this.config);
    }
  }
}
