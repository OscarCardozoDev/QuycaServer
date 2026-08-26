import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InstitutionService } from './Institution.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('InstitutionService.leaveInstitution', () => {
  let service: InstitutionService;
  let prisma: any;

  const membership = (over: Record<string, unknown> = {}) => ({
    isActive: true,
    contextRole: 'student',
    institution: { slug: 'usta-tunja' },
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      userInstitution: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
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

  it('da de baja la membresía y sella leftAt', async () => {
    prisma.userInstitution.findUnique.mockResolvedValue(membership());

    const result = await service.leaveInstitution('u1', 'inst-1');

    expect(result).toEqual({ uid: 'inst-1' });
    expect(prisma.userInstitution.update).toHaveBeenCalledWith({
      where: { userId_institutionId: { userId: 'u1', institutionId: 'inst-1' } },
      data: { isActive: false, leftAt: expect.any(Date) },
    });
  });

  it('nunca borra la fila: la membresía es historial', async () => {
    prisma.userInstitution.findUnique.mockResolvedValue(membership());

    await service.leaveInstitution('u1', 'inst-1');

    expect(prisma.userInstitution.delete).toBeUndefined();
  });

  it('sin membresía es 404', async () => {
    prisma.userInstitution.findUnique.mockResolvedValue(null);

    await expect(service.leaveInstitution('u1', 'inst-1')).rejects.toThrow(NotFoundException);
    expect(prisma.userInstitution.update).not.toHaveBeenCalled();
  });

  it('una membresía ya dada de baja es 404, no una baja repetida', async () => {
    prisma.userInstitution.findUnique.mockResolvedValue(membership({ isActive: false }));

    await expect(service.leaveInstitution('u1', 'inst-1')).rejects.toThrow(NotFoundException);
    expect(prisma.userInstitution.update).not.toHaveBeenCalled();
  });

  it('de quyca-platform no se sale: es el espacio propio del artista', async () => {
    prisma.userInstitution.findUnique.mockResolvedValue(
      membership({ institution: { slug: 'quyca-platform' } }),
    );

    await expect(service.leaveInstitution('u1', 'inst-1')).rejects.toThrow(ConflictException);
    expect(prisma.userInstitution.update).not.toHaveBeenCalled();
  });

  it('el único rector no puede irse y dejar la institución huérfana', async () => {
    prisma.userInstitution.findUnique.mockResolvedValue(membership({ contextRole: 'rector' }));
    prisma.userInstitution.count.mockResolvedValue(0);

    await expect(service.leaveInstitution('u1', 'inst-1')).rejects.toThrow(ConflictException);
    expect(prisma.userInstitution.update).not.toHaveBeenCalled();
  });

  it('un rector con otro rector activo sí puede salir', async () => {
    prisma.userInstitution.findUnique.mockResolvedValue(membership({ contextRole: 'rector' }));
    prisma.userInstitution.count.mockResolvedValue(1);

    await expect(service.leaveInstitution('u1', 'inst-1')).resolves.toEqual({ uid: 'inst-1' });
    // El conteo excluye al que se va: si se contara a sí mismo, siempre daría 1
    // y el último rector podría dejar la institución sin nadie a cargo.
    expect(prisma.userInstitution.count).toHaveBeenCalledWith({
      where: {
        institutionId: 'inst-1',
        contextRole: 'rector',
        isActive: true,
        userId: { not: 'u1' },
      },
    });
  });
});
