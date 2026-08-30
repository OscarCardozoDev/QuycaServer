import { Test } from '@nestjs/testing';
import { HttpStatus, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupService, FREE_PLATFORM_GROUPS } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';

const PLATFORM_UID = 'platform-uid';
const OTHER_INST_UID = 'otra-institucion-uid';

describe('GroupService — límite de grupos de plataforma', () => {
  let service: GroupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      groups: { findMany: jest.fn().mockResolvedValue([{ uid: 'g1' }]) },
      users: { findUnique: jest.fn().mockResolvedValue({ uid: 'u1' }) },
      userInstitution: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }]) },
      institution: { findUnique: jest.fn().mockResolvedValue({ uid: PLATFORM_UID }) },
      usersGroups: { count: jest.fn(), create: jest.fn().mockResolvedValue({ uid: 'ug1', groupId: 'g1' }) },
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

  // Los dos casos del limite salen de FREE_PLATFORM_GROUPS y no de un numero
  // escrito a mano. Antes decian "el primero pasa, el segundo da 402", que solo
  // era cierto con el cupo en 1: al subirlo a 5 el test se cayo aunque la regla
  // seguia bien. Lo que se prueba es la regla —debajo del cupo entra, en el cupo
  // corta—, no el valor de hoy.
  it('deja entrar mientras no se alcanzo el cupo', async () => {
    prisma.usersGroups.count.mockResolvedValue(FREE_PLATFORM_GROUPS - 1);

    await expect(
      service.addStudentToGroups({ userId: 'u1', groupIds: ['g1'], institutionId: PLATFORM_UID }),
    ).resolves.toBeDefined();
  });

  it('devuelve 402 al alcanzar el cupo', async () => {
    prisma.usersGroups.count.mockResolvedValue(FREE_PLATFORM_GROUPS);

    await expect(
      service.addStudentToGroups({ userId: 'u1', groupIds: ['g1'], institutionId: PLATFORM_UID }),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });
  });

  it('no cuenta los grupos de una institución', async () => {
    // El usuario ya pasó el cupo holgadamente, pero la institución activa NO es
    // la plataforma: el límite no aplica. Se usa el cupo + 10 y no un 3 fijo,
    // que con el cupo en 5 ya no probaba nada.
    prisma.usersGroups.count.mockResolvedValue(FREE_PLATFORM_GROUPS + 10);

    await expect(
      service.addStudentToGroups({ userId: 'u1', groupIds: ['g1'], institutionId: OTHER_INST_UID }),
    ).resolves.toBeDefined();
  });

  it('cuenta solo los grupos cuyo grupo pertenece a la plataforma', async () => {
    prisma.usersGroups.count.mockResolvedValue(0);

    await service.addStudentToGroups({ userId: 'u1', groupIds: ['g1'], institutionId: PLATFORM_UID });

    expect(prisma.usersGroups.count).toHaveBeenCalledWith({
      where: { userId: 'u1', group: { institutionId: PLATFORM_UID } },
    });
  });
});
