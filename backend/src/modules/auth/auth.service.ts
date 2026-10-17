import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from './sessions.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { EmailService } from '../email/email.service';
import { AuthContext } from '../../common/request-context';
import { TooManyAttemptsException } from '../../common/exceptions/too-many-attempts.exception';
import { generateToken, hashToken, normalizeEmail } from '../../common/tokens';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface LoginResult {
  token: string;
  user: { id: string; email: string; name: string };
}

/**
 * Authentication (spec etapa-1.md §4.1): register, login, logout, me and
 * password recovery. Generic 401 on bad credentials (AC-1.4), login rate
 * limited (spec §3), password reset revokes every session (AC-1.6).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly rateLimit: LoginRateLimitService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  }

  async register(dto: RegisterDto) {
    const email = normalizeEmail(dto.email);
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email.');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, name: dto.name.trim(), passwordHash },
      });
      await this.audit.record(
        {
          companyId: null,
          actorUserId: created.id,
          action: AUDIT_ACTIONS.USER_REGISTERED,
          entityType: AUDIT_ENTITIES.USER,
          entityId: created.id,
        },
        tx,
      );
      return created;
    });

    return { id: user.id, email: user.email, name: user.name };
  }

  async login(
    dto: LoginDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const email = normalizeEmail(dto.email);
    const key = `${meta.ip ?? 'unknown'}|${email}`;

    const limit = this.rateLimit.check(key);
    if (!limit.allowed) {
      throw new TooManyAttemptsException(limit.retryAfterSeconds);
    }

    const user = await this.usersService.findByEmail(email);
    const passwordOk =
      user && user.status === 'active'
        ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
        : false;
    if (!user || !passwordOk) {
      this.rateLimit.recordFailure(key);
      // Generic message: never reveals whether the email exists (AC-1.4).
      throw new UnauthorizedException('Credenciales inválidas.');
    }
    this.rateLimit.reset(key);

    const { token, sessionId } = await this.sessionsService.create(user.id, meta);
    await this.audit.record({
      companyId: null,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      entityType: AUDIT_ENTITIES.SESSION,
      entityId: sessionId,
    });

    return { token, user: { id: user.id, email: user.email, name: user.name } };
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.sessionsService.revoke(auth.sessionId);
    await this.audit.record({
      companyId: null,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      entityType: AUDIT_ENTITIES.SESSION,
      entityId: auth.sessionId,
    });
  }

  /** Current user + active memberships (spec §4.1, test #24). */
  async me(auth: AuthContext) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: {
        memberships: {
          where: { status: 'active' },
          include: { company: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      memberships: user.memberships.map((m) => ({
        companyId: m.company.id,
        companyName: m.company.name,
        companyType: m.company.type,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
    };
  }

  /** Always answers 202 without revealing whether the email exists (AC-1.7). */
  async forgotPassword(emailRaw: string): Promise<void> {
    const email = normalizeEmail(emailRaw);
    const user = await this.usersService.findByEmail(email);
    if (!user || user.status !== 'active') {
      return;
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    });

    try {
      await this.email.sendPasswordReset(user.email, {
        name: user.name,
        resetUrl: `${this.frontendUrl}/reset-password?token=${token}`,
        expiresAt,
      });
    } catch (error) {
      // The token stays valid; a failed send must not leak via status codes.
      this.logger.error(
        `No se pudo enviar el email de recuperación a ${user.email}: ${(error as Error).message}`,
      );
    }
  }

  /** Consumes the token, changes the password and kills every session. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    await this.prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!resetToken) {
        throw new NotFoundException('El enlace de recuperación no es válido.');
      }
      const now = new Date();
      if (resetToken.usedAt) {
        throw new GoneException('Este enlace de recuperación ya fue usado.');
      }
      if (resetToken.expiresAt <= now) {
        throw new GoneException('Este enlace de recuperación expiró.');
      }

      const passwordHash = await argon2.hash(dto.password);
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });
      await tx.session.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.audit.record(
        {
          companyId: null,
          actorUserId: resetToken.userId,
          action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET,
          entityType: AUDIT_ENTITIES.USER,
          entityId: resetToken.userId,
        },
        tx,
      );
    });
  }
}
