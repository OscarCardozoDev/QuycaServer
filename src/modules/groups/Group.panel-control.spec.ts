import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupService } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Los dos endpoints que `/dashboard/panel-control` llamaba desde siempre y que
 * no existían en el backend: 404 para los seis roles.
 * Ver obsidian/Raw/Specs/2026-08-23-matriz-de-permisos-design.md §3.12.
 */
const GRUPO = 'g-artes';
const RECTOR = 'u-rector';
const ESTUDIANTE = 'u-estudiante';
const AJENO = 'u-de-otro-grupo';
const ID_USER = 'ut-user';

describe('GroupService — panel de control', () => {
  let service: GroupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      groups: {
        findUnique: jest.fn().mockResolvedValue({
          uid: GRUPO,
          name: 'Artes',
          groupCategory: { name: 'Artes plásticas' },
          profesor: {
            uid: 'u-prof',
            name: 'Ana',
            lastName: 'Gómez',
            username: 'ana',
          },
        }),
      },
      usersGroups: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([
          {
            user: {
              uid: ESTUDIANTE,
              name: 'Luis',
              lastName: 'Pérez',
              username: 'luis',
            },
          },
        ]),
      },
      products: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'APPROVED', _count: { _all: 4 } },
          { status: 'PENDING', _count: { _all: 2 } },
        ]),
      },
      events: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ status: 'COMPLETED', _count: { _all: 1 } }]),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => ID_USER) } },
      ],
    }).compile();

    service = module.get(GroupService);
  });

  describe('getGroupStats', () => {
    it('arma la forma que la pantalla espera', async () => {
      const stats = await service.getGroupStats(GRUPO, RECTOR, 'rector');

      expect(stats).toEqual({
        uid: GRUPO,
        name: 'Artes',
        category: 'Artes plásticas',
        profesor: { uid: 'u-prof', name: 'Ana Gómez', username: 'ana' },
        students: { total: 3 },
        products: { total: 6, approved: 4, pending: 2, rejected: 0 },
        events: {
          total: 1,
          approved: 0,
          pending: 0,
          cancelled: 0,
          completed: 1,
        },
      });
    });

    it('un estado sin filas cuenta 0, no undefined', async () => {
      prisma.products.groupBy.mockResolvedValue([]);

      const stats = await service.getGroupStats(GRUPO, RECTOR, 'rector');

      expect(stats.products).toEqual({
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
      });
    });

    it('respeta el segundo eje: quien no es del grupo recibe 404', async () => {
      prisma.usersGroups.findUnique.mockResolvedValue(null);

      await expect(
        service.getGroupStats(GRUPO, AJENO, 'student'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el rector entra sin que se consulte membresía', async () => {
      await service.getGroupStats(GRUPO, RECTOR, 'rector');

      expect(prisma.usersGroups.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getGroupMembers', () => {
    it('pagina y devuelve el nombre completo', async () => {
      const result = await service.getGroupMembers(GRUPO, RECTOR, 'rector', {
        page: 2,
        limit: 10,
      });

      expect(result).toEqual({
        data: [{ uid: ESTUDIANTE, name: 'Luis Pérez', username: 'luis' }],
        total: 3,
        page: 2,
        limit: 10,
      });
      expect(prisma.usersGroups.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('cuenta el total con el MISMO where que la página', async () => {
      await service.getGroupMembers(GRUPO, RECTOR, 'rector');

      const listWhere = prisma.usersGroups.findMany.mock.calls[0][0].where;
      const countWhere = prisma.usersGroups.count.mock.calls[0][0].where;
      expect(countWhere).toEqual(listWhere);
      expect(listWhere).toEqual({
        groupId: GRUPO,
        user: { userTypeId: ID_USER },
      });
    });

    it('respeta el segundo eje: quien no es del grupo recibe 404', async () => {
      prisma.usersGroups.findUnique.mockResolvedValue(null);

      await expect(
        service.getGroupMembers(GRUPO, AJENO, 'student'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
