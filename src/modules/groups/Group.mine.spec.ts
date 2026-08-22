import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GroupService } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('GroupService.getMyGroups', () => {
  let service: GroupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = { usersGroups: { findMany: jest.fn().mockResolvedValue([]) } };

    const module = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: PrismaService, useValue: prisma },
        // GroupService también depende de ConfigService (lo usa
        // getAllStudentsByGroup); sin mockearlo, Nest no puede resolver el
        // constructor y falla la compilación del módulo de test. Mismo
        // patrón que Group.platform-limit.spec.ts en este mismo directorio.
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(GroupService);
  });

  it('pide solo los grupos del usuario en la institución activa', async () => {
    // El `select` anidado hacia `group` no lo filtra la extensión de tenant
    // (ver Task 6B / obsidian/errors/multitenant/2026-08-07-...): se
    // verificó en vivo que sin este filtro explícito el método devolvía
    // grupos de otras instituciones. Por eso el where lleva institutionId
    // además de userId, y este test lo fija para que no vuelva a romperse.
    // Task 4 agrega isActive: true para excluir grupos desactivados.
    await service.getMyGroups('u1', 'inst-1');

    expect(prisma.usersGroups.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', group: { institutionId: 'inst-1', isActive: true } },
      }),
    );
  });

  it('devuelve el grupo aplanado, no la fila puente', async () => {
    prisma.usersGroups.findMany.mockResolvedValue([
      { group: { uid: 'g1', name: 'Teatro' } },
    ]);

    await expect(service.getMyGroups('u1', 'inst-1')).resolves.toEqual([
      { uid: 'g1', name: 'Teatro' },
    ]);
  });
});
