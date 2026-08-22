import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupService } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';

const ARTES_GROUP = 'g-artes';
const PROF_MUSICA = 'u-prof-musica';
const ESTUDIANTE = 'u-estudiante';
const RECTOR = 'u-rector';

describe('GroupService.getById — el detalle del grupo también es cerrado', () => {
  let service: GroupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      groups: {
        findUnique: jest.fn().mockResolvedValue({
          uid: ARTES_GROUP,
          name: 'Artes',
          profesorId: 'u-prof-artes',
          users: [{ user: { uid: ESTUDIANTE, name: 'Ana' } }],
        }),
      },
      usersGroups: { findUnique: jest.fn() },
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

  it('el rector entra sin que se consulte membresía', async () => {
    await service.getById(ARTES_GROUP, RECTOR, 'rector');

    expect(prisma.usersGroups.findUnique).not.toHaveBeenCalled();
  });

  it('un miembro del grupo entra', async () => {
    prisma.usersGroups.findUnique.mockResolvedValue({ uid: 'ug-1' });

    await expect(
      service.getById(ARTES_GROUP, ESTUDIANTE, 'student'),
    ).resolves.toBeDefined();
  });

  // El caso del pedido: el profesor de Música no puede leer quiénes son los
  // estudiantes del grupo de ARTES. 404 y no 403: un 403 confirmaría que el
  // grupo existe.
  it('el docente de otro grupo recibe 404, no 403', async () => {
    prisma.usersGroups.findUnique.mockResolvedValue(null);

    await expect(
      service.getById(ARTES_GROUP, PROF_MUSICA, 'institutional'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un grupo que no existe también es 404, indistinguible del ajeno', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);
    prisma.usersGroups.findUnique.mockResolvedValue(null);

    await expect(
      service.getById('g-fantasma', PROF_MUSICA, 'institutional'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
