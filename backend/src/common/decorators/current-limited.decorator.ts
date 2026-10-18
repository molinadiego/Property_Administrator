import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { LimitedAccess } from '../guards/limited-access.guard';

/** Resolves the limited-access context set by LimitedAccessGuard. */
export const CurrentLimited = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): LimitedAccess => {
    const request = ctx.switchToHttp().getRequest();
    return request.limited;
  },
);
