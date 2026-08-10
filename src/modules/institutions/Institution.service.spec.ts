import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InstitutionService } from './Institution.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

const mockPlan = { uid: 'plan-uid', slug: 'academia' };
const mockInstitution = { uid: 'inst-uid', slug: 'test-uni', status: 'TRIAL' };

describe('InstitutionService', () => {
  let service: InstitutionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      subscriptionPlan: { findUnique: jest.fn() },
      institution: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      credentials: { create: jest.fn(), findUnique: jest.fn() },
      users: { create: jest.fn() },
      userInstitution: { create: jest.fn(), findUnique: jest.fn() },
      institutionInvitation: {
        create: jest.fn(), findMany: jest.fn(),
        findUnique: jest.fn(), update: jest.fn(),
      },
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
    it('throws ConflictException when slug is taken', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      prisma.institution.findUnique.mockResolvedValue(mockInstitution);
      await expect(service.createInstitution({
        name: 'Test', slug: 'test-uni', type: 'EDUCATIONAL',
        representativeName: 'A', representativeLastName: 'B',
        email: 'a@b.com', password: 'Pass@1234!',
      })).rejects.toThrow(ConflictException);
    });

    // El plan ya no lo elige el caller: nace en el plan por defecto
    // ("empirico"). Si ese plan no existe en la base (seed no corrido), sigue
    // siendo un 404.
    it('throws NotFoundException when default plan is not seeded', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue(null);
      await expect(service.createInstitution({
        name: 'Test', slug: 'new-slug', type: 'EDUCATIONAL',
        representativeName: 'A', representativeLastName: 'B',
        email: 'a@b.com', password: 'Pass@1234!',
      })).rejects.toThrow(NotFoundException);
    });

    it('creates institution, credentials, user, userInstitution in transaction', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      prisma.institution.findUnique.mockResolvedValue(null);
      prisma.institution.create.mockResolvedValue({ uid: 'inst-uid' });
      prisma.credentials.create.mockResolvedValue({ uid: 'cred-uid' });
      prisma.users.create.mockResolvedValue({ uid: 'cred-uid' });
      prisma.userInstitution.create.mockResolvedValue({});

      const result = await service.createInstitution({
        name: 'Test Uni', slug: 'test-uni', type: 'EDUCATIONAL',
        representativeName: 'John', representativeLastName: 'Doe',
        email: 'rector@test.edu', password: 'Pass@1234!',
      });

      expect(result).toEqual({ uid: 'inst-uid' });
      expect(prisma.institution.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'test-uni', type: 'EDUCATIONAL' }) })
      );
      expect(prisma.userInstitution.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ contextRole: 'rector' }) })
      );
    });
  });

  describe('respondToInvitation', () => {
    it('throws NotFoundException when token not found', async () => {
      prisma.institutionInvitation.findUnique.mockResolvedValue(null);
      await expect(service.respondToInvitation({
        token: 'bad-token', userId: 'user-uid', accept: true,
      })).rejects.toThrow(NotFoundException);
    });

    it('creates UserInstitution on ACCEPT', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      prisma.institutionInvitation.findUnique.mockResolvedValue({
        uid: 'inv-uid', institutionId: 'inst-uid', toEmail: 'a@b.com',
        targetRole: 'student', status: 'PENDING', expiresAt: futureDate,
      });
      prisma.credentials.findUnique.mockResolvedValue({ mail: 'a@b.com' });
      prisma.userInstitution.findUnique.mockResolvedValue(null);
      prisma.userInstitution.create.mockResolvedValue({});
      prisma.institutionInvitation.update.mockResolvedValue({});

      const result = await service.respondToInvitation({
        token: 'valid-token', userId: 'user-uid', accept: true,
      });

      expect(result).toEqual({ status: 'ACCEPTED' });
      expect(prisma.userInstitution.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ contextRole: 'student' }) })
      );
    });
  });
});
