import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CONTEXT_ROLE_KEY } from 'src/decorators/context-role.decorator';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';

@Injectable()
export class ContextRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      CONTEXT_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const { contextRole } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!contextRole || !required.includes(contextRole)) {
      throw new ForbiddenException('Insufficient role for this institution');
    }
    return true;
  }
}
