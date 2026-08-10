import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InstitutionService } from './Institution.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('InstitutionService.listPlans', () => {
  let service: InstitutionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = { subscriptionPlan: { findMany: jest.fn().mockResolvedValue([]) } };

    const module = await Test.createTestingModule({
      providers: [
        InstitutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(InstitutionService);
  });

  it('devuelve solo los planes activos', async () => {
    await service.listPlans();

    expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('no expone el stripePriceId', async () => {
    await service.listPlans();

    const args = prisma.subscriptionPlan.findMany.mock.calls[0][0];
    expect(args.select.stripePriceId).toBeUndefined();
  });
});
