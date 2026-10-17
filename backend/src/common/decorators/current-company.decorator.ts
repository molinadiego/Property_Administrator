import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CompanyAccess } from '../request-context';

/** Resolves the company context set by CompanyAccessGuard. */
export const CurrentCompany = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CompanyAccess => {
    const request = ctx.switchToHttp().getRequest();
    return request.company;
  },
);
