import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InstitutionService } from './Institution.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('InstitutionService — plan', () => {
  let service: InstitutionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      subscriptionPlan: { findUnique: jest.fn(), findMany: jest.fn() },
      institution: {
        findUnique: jest.fn().mockResolvedValue({ uid: 'inst-1' }),
        create: jest.fn().mockResolvedValue({ uid: 'inst-1' }),
        update: jest.fn().mockResolvedValue({ uid: 'inst-1' }),
      },
      credentials: { create: jest.fn().mockResolvedValue({ uid: 'c1' }) },
      users: { create: jest.fn() },
      userInstitution: { create: jest.fn() },
      groupCategory: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        InstitutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('type-uid') } },
      ],
    }).compile();

    service = module.get(InstitutionService);
  });

  describe('createInstitution', () => {
    it('nace en el plan empirico sin que el caller lo elija', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue({ uid: 'plan-empirico' });
      prisma.institution.findUnique.mockResolvedValue(null);

      await service.createInstitution({
        name: 'Uni', slug: 'uni', type: 'EDUCATIONAL',
        representativeName: 'A', representativeLastName: 'B',
        email: 'a@b.com', password: 'hash12345',
      } as any);

      expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({
        where: { slug: 'empirico' },
      });
      expect(prisma.institution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'TRIAL', planChosenAt: null }),
        }),
      );
    });
  });

  describe('changePlan', () => {
    it('sella planChosenAt y cambia el plan', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue({ uid: 'plan-academia' });

      await service.changePlan('inst-1', 'academia');

      expect(prisma.institution.update).toHaveBeenCalledWith({
        where: { uid: 'inst-1' },
        data: { subscriptionPlanId: 'plan-academia', planChosenAt: expect.any(Date) },
      });
    });

    it('con planSlug null solo sella la decisión, sin tocar el plan', async () => {
      await service.changePlan('inst-1', null);

      expect(prisma.institution.update).toHaveBeenCalledWith({
        where: { uid: 'inst-1' },
        data: { planChosenAt: expect.any(Date) },
      });
    });

    it('lanza 404 si el plan no existe', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

      await expect(service.changePlan('inst-1', 'inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
