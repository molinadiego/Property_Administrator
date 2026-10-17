import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyRole, REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';
import { AuthContext } from '../request-context';

/**
 * Tenant guard for `/companies/:id/...` routes. The company comes from the URL
 * but access is derived from the caller's membership, read on every request
 * (spec §5, §16.2/§16.8):
 *
 * - No active membership (other company, revoked, unknown) → 404: existence of
 *   foreign data is never leaked (spec §3).
 * - Active membership but insufficient role (@RequireRole('owner')) → 403.
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const auth = request.auth as AuthContext | undefined;
    const companyId = request.params?.id as string | undefined;
    if (!auth || !companyId) {
      throw new UnauthorizedException('Se requiere iniciar sesión.');
    }

    const membership = await this.prisma.membership.findFirst({
      where: { companyId, userId: auth.userId, status: 'active' },
    });
    if (!membership) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    const requiredRole = this.reflector.getAllAndOverride<CompanyRole | undefined>(
      REQUIRE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRole === 'owner' && membership.role !== 'owner') {
      throw new ForbiddenException("El rol 'member' no puede realizar esta acción.");
    }

    request.company = {
      companyId: membership.companyId,
      membershipId: membership.id,
      role: membership.role,
    };
    return true;
  }
}
