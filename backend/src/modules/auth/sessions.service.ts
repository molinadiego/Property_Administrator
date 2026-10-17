import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateToken, hashToken } from '../../common/tokens';
import { AuthContext } from '../../common/request-context';
import { SESSION_TTL_DAYS } from '../../common/guards/session.guard';

export interface CreatedSession {
  /** Raw token for the cookie — never persisted, only its hash is stored. */
  token: string;
  sessionId: string;
}

/**
 * Sessions in Postgres (spec §2.5): the cookie carries a random token, the DB
 * stores only its SHA-256 hash. Expiry slides with activity; expired rows are
 * purged lazily on every new login (spec §11).
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<CreatedSession> {
    await this.prisma.session.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    const token = generateToken();
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        lastSeenAt: now,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return { token, sessionId: session.id };
  }

  /** Resolves an optional session token to an auth context (accept flow). */
  async resolveOptional(token?: string): Promise<AuthContext | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'active') return null;
    return { userId: user.id, sessionId: session.id };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Used by password reset: kills every device in one transaction (AC-1.6). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
