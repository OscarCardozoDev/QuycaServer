import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CrossTenantGuard } from './cross-tenant.guard';
import { tenantStorage } from './tenant-context';

function makeContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('CrossTenantGuard', () => {
  let guard: CrossTenantGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [CrossTenantGuard, Reflector],
    }).compile();
    guard = module.get(CrossTenantGuard);
    reflector = module.get(Reflector);
  });

  it('sets bypass to true when the handler is decorated with @AllowCrossTenant()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const store = { institutionId: null as string | null, bypass: false };

    tenantStorage.run(store, () => {
      const result = guard.canActivate(makeContext());
      expect(result).toBe(true);
    });

    expect(store.bypass).toBe(true);
  });

  it('leaves the store untouched when the handler is not decorated', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const store = { institutionId: 'inst-uid', bypass: false };

    tenantStorage.run(store, () => {
      const result = guard.canActivate(makeContext());
      expect(result).toBe(true);
    });

    expect(store.bypass).toBe(false);
  });

  it('returns true even when there is no active store', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(tenantStorage.getStore()).toBeUndefined();
    const result = guard.canActivate(makeContext());
    expect(result).toBe(true);
  });
});
