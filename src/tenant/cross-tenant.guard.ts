import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CROSS_TENANT_KEY } from 'src/decorators/cross-tenant.decorator';
import { tenantStorage } from './tenant-context';

@Injectable()
export class CrossTenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<boolean>(
      CROSS_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed) return true;

    const store = tenantStorage.getStore();
    if (store) store.bypass = true;
    return true;
  }
}
