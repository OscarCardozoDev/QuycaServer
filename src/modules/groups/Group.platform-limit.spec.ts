import { Test } from '@nestjs/testing';
import { HttpStatus, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupService } from './Group.service';
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

  it('deja entrar al primer grupo de plataforma', async () => {
    prisma.usersGroups.count.mockResolvedValue(0);

    await expect(
      service.addStudentToGroups({ userId: 'u1', groupIds: ['g1'], institutionId: PLATFORM_UID }),
    ).resolves.toBeDefined();
  });

  it('devuelve 402 en el segundo grupo de plataforma', async () => {
    prisma.usersGroups.count.mockResolvedValue(1);

    await expect(
      service.addStudentToGroups({ userId: 'u1', groupIds: ['g1'], institutionId: PLATFORM_UID }),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });
  });

  it('no cuenta los grupos de una institución', async () => {
    // El usuario ya tiene 3 grupos, pero la institución activa NO es la
    // plataforma: el límite no aplica y no debe ni consultarse.
    prisma.usersGroups.count.mockResolvedValue(3);

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
