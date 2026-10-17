import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { hashToken } from '../tokens';

export const SESSION_COOKIE = 'mh_session';
export const SESSION_TTL_DAYS = 30;

/** Slides last_seen_at at most once per hour per session (spec §2.5). */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Global guard: every request must carry a valid `mh_session` cookie unless
 * the route is marked @Public(). Permissions are re-evaluated on every request
 * against the DB (spec §3) — never trusted from the cookie itself.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('Se requiere iniciar sesión.');
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw new UnauthorizedException('La sesión no es válida o expiró.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('La sesión no es válida o expiró.');
    }

    request.auth = { userId: user.id, sessionId: session.id };

    // Sliding renewal (spec §2.5): extend expiry on activity, throttled.
    if (now.getTime() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
    }

    return true;
  }
}
