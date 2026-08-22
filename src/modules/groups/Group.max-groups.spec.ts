import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupService } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';

const INST = 'inst-usta';
const ARTES = 'cat-artes';

describe('GroupService — el límite de grupos del plan', () => {
  let service: GroupService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      groups: { create: jest.fn().mockResolvedValue({ uid: 'g1' }) },
      usersGroups: { create: jest.fn(), createMany: jest.fn() },
    };

    prisma = {
      groups: { count: jest.fn().mockResolvedValue(0) },
      userInstitution: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const module = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(GroupService);
  });

  it('crea el grupo cuando el plan todavía tiene cupo', async () => {
    prisma.groups.count.mockResolvedValue(2);

    await expect(
      service.createGroupUseCase({
        name: 'Artes y Fotografía',
        institutionId: INST,
        categoryId: ARTES,
        maxGroups: 5,
      }),
    ).resolves.toEqual({ uid: 'g1' });
  });

  it('devuelve 402 cuando el plan llegó al tope', async () => {
    prisma.groups.count.mockResolvedValue(5);

    await expect(
      service.createGroupUseCase({
        name: 'Uno más',
        institutionId: INST,
        categoryId: ARTES,
        maxGroups: 5,
      }),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // maxGroups null = sin límite. El plan `empirico` es el de quyca-platform:
  // ponerle tope sería un tope global de la plataforma.
  it('no consulta el conteo cuando el plan no tiene límite', async () => {
    await expect(
      service.createGroupUseCase({
        name: 'Sin tope',
        institutionId: INST,
        categoryId: ARTES,
        maxGroups: null,
      }),
    ).resolves.toEqual({ uid: 'g1' });

    expect(prisma.groups.count).not.toHaveBeenCalled();
  });

  // Groups es scoped: la extensión inyecta el institutionId. Escribirlo a mano
  // no solo es ruido, es una pista falsa para quien lea el código después.
  it('cuenta solo los grupos activos, sin escribir el institutionId a mano', async () => {
    prisma.groups.count.mockResolvedValue(1);

    await service.createGroupUseCase({
      name: 'Otro',
      institutionId: INST,
      categoryId: ARTES,
      maxGroups: 3,
    });

    expect(prisma.groups.count).toHaveBeenCalledWith({ where: { isActive: true } });
  });

  it('guarda descripción, reglas y portada cuando vienen', async () => {
    await service.createGroupUseCase({
      name: 'Artes y Fotografía',
      institutionId: INST,
      categoryId: ARTES,
      maxGroups: null,
      description: 'Colectivo de fotografía analógica',
      rules: 'Traer materiales propios.',
      coverPhotoId: 'photo-1',
    });

    expect(tx.groups.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'Colectivo de fotografía analógica',
          rules: 'Traer materiales propios.',
          coverPhotoId: 'photo-1',
        }),
      }),
    );
  });
});
