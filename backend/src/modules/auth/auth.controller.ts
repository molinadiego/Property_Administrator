import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthContext, AuthenticatedRequest } from '../../common/request-context';
import { clearSessionCookie, setSessionCookie } from '../../common/session-cookie';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Crea la cuenta personal (no crea espacio)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Cuenta creada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email ya registrado (409)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión y setea la cookie mh_session' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Sesión iniciada' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Credenciales inválidas (401 genérico)' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Demasiados intentos (429 con Retry-After)' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto, {
      ip: (req as AuthenticatedRequest).ip ?? req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    });
    setSessionCookie(res, result.token, this.config);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoca la sesión actual' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Sesión revocada' })
  async logout(
    @CurrentUser() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(auth);
    clearSessionCookie(res, this.config);
  }

  @Get('me')
  @ApiOperation({ summary: 'Usuario actual y sus membresías activas con rol' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Datos del usuario' })
  me(@CurrentUser() auth: AuthContext) {
    return this.authService.me(auth);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Envía link de recuperación (siempre 202, no revela existencia)' })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Procesado (siempre)' })
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambia la contraseña con token y revoca todas las sesiones' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Contraseña actualizada' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Token inválido (404)' })
  @ApiResponse({ status: HttpStatus.GONE, description: 'Token expirado o ya usado (410)' })
  async reset(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
  }
}
