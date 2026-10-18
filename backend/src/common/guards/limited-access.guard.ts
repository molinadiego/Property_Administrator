import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hashToken } from '../tokens';

/** Tenant context attached by LimitedAccessGuard. */
export interface LimitedAccess {
  tenantId: string;
  tokenRecordId: string;
}

/**
 * Resolves the opaque limited-access token in `/limited/:token/...` routes
 * (approved decision, spec etapa-2 §3): only the token's hash is stored; the
 * token is revoked or expires → 401. The routes are @Public() for the global
 * SessionGuard — the token IS the credential.
 */
@Injectable()
export class LimitedAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.params?.token as string | undefined;
    if (!token) throw new UnauthorizedException('Token de acceso requerido.');

    const record = await this.prisma.limitedAccessToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    const now = new Date();
    if (!record || record.status !== 'active' || record.expiresAt <= now) {
      throw new UnauthorizedException('El acceso no es válido o expiró.');
    }

    request.limited = { tenantId: record.tenantId, tokenRecordId: record.id } satisfies LimitedAccess;
    return true;
  }
}
