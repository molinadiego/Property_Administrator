import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { LoginRateLimitService } from './login-rate-limit.service';

/**
 * Authentication: sessions, login, logout, password recovery.
 * Implemented in Etapa 1 (docs/especificacion/etapa-1.md).
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionsService, LoginRateLimitService],
  exports: [SessionsService],
})
export class AuthModule {}
