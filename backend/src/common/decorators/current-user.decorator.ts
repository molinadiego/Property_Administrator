import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext } from '../request-context';

/** Resolves the authenticated user/session context set by SessionGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth;
  },
);
