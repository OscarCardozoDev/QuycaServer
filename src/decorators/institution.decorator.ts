import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';

export const Institution = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.institution;
  },
);
