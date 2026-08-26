import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InstitutionService } from './Institution.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('InstitutionService.getBySlug — acceso', () => {
  let service: InstitutionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      institution: { findUnique: jest.fn() },
      userInstitution: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        InstitutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(InstitutionService);
  });

  it('un miembro activo recibe la institución', async () => {
    prisma.institution.findUnique.mockResolvedValue({ uid: 'inst-1', slug: 'usta' });
    prisma.userInstitution.findUnique.mockResolvedValue({ isActive: true });

    const result = await service.getBySlug('usta', 'u1');

    expect(result).toEqual({ uid: 'inst-1', slug: 'usta' });
    expect(prisma.userInstitution.findUnique).toHaveBeenCalledWith({
      where: { userId_institutionId: { userId: 'u1', institutionId: 'inst-1' } },
    });
  });

  it('un autenticado sin membresía recibe 403', async () => {
    prisma.institution.findUnique.mockResolvedValue({ uid: 'inst-1', slug: 'usta' });
    prisma.userInstitution.findUnique.mockResolvedValue(null);

    await expect(service.getBySlug('usta', 'u1')).rejects.toThrow(ForbiddenException);
  });

  it('una membresía inactiva recibe 403', async () => {
    prisma.institution.findUnique.mockResolvedValue({ uid: 'inst-1', slug: 'usta' });
    prisma.userInstitution.findUnique.mockResolvedValue({ isActive: false });

    await expect(service.getBySlug('usta', 'u1')).rejects.toThrow(ForbiddenException);
  });

  it('un slug inexistente sigue siendo 404 y ni siquiera consulta la membresía', async () => {
    prisma.institution.findUnique.mockResolvedValue(null);

    await expect(service.getBySlug('no-existe', 'u1')).rejects.toThrow(NotFoundException);
    expect(prisma.userInstitution.findUnique).not.toHaveBeenCalled();
  });
});
