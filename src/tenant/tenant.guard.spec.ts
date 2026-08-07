import { Test } from '@nestjs/testing';
import { ExecutionContext, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { tenantStorage } from './tenant-context';

const mockInstitution = {
  uid: 'inst-uid',
  slug: 'test-uni',
  status: 'ACTIVE',
  subscriptionPlan: { features: ['groups_create'] },
};

const mockMembership = { contextRole: 'rector', isActive: true };

function makeContext(overrides: Partial<{ slug: string; uid: string }> = {}): ExecutionContext {
  const req = {
    institutionSlug: overrides.slug ?? 'test-uni',
    user: { uid: overrides.uid ?? 'user-uid' },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      institution: { findUnique: jest.fn() },
      userInstitution: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        TenantGuard,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();
    guard = module.get(TenantGuard);
  });

  it('throws BadRequestException when no slug in header', async () => {
    const ctx = makeContext({ slug: undefined as any });
    (ctx.switchToHttp().getRequest() as any).institutionSlug = null;
    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when institution not found', async () => {
    prismaMock.institution.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext())).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when institution is suspended', async () => {
    prismaMock.institution.findUnique.mockResolvedValue({ ...mockInstitution, status: 'SUSPENDED' });
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is not a member', async () => {
    prismaMock.institution.findUnique.mockResolvedValue(mockInstitution);
    prismaMock.userInstitution.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ForbiddenException);
  });

  it('attaches institution and contextRole to request and returns true', async () => {
    prismaMock.institution.findUnique.mockResolvedValue(mockInstitution);
    prismaMock.userInstitution.findUnique.mockResolvedValue(mockMembership);
    const ctx = makeContext();
    const result = await guard.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest() as any;
    expect(result).toBe(true);
    expect(req.institution).toEqual(mockInstitution);
    expect(req.contextRole).toBe('rector');
  });

  it('rechaza si la membresía está inactiva', async () => {
    prismaMock.institution.findUnique.mockResolvedValue(mockInstitution);
    prismaMock.userInstitution.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      'User is not a member of this institution',
    );
  });

  it('deposita el institutionId en el store de tenant', async () => {
    prismaMock.institution.findUnique.mockResolvedValue(mockInstitution);
    prismaMock.userInstitution.findUnique.mockResolvedValue(mockMembership);

    const store = { institutionId: null as string | null, bypass: false };
    await tenantStorage.run(store, async () => {
      await guard.canActivate(makeContext());
    });

    expect(store.institutionId).toBe('inst-uid');
  });
});
