import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from 'src/decorators/feature.decorator';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<string>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const features = req.institution?.subscriptionPlan?.features as string[] | undefined;

    if (!features?.includes(feature)) {
      throw new ForbiddenException(`Feature "${feature}" not available on your plan`);
    }
    return true;
  }
}
