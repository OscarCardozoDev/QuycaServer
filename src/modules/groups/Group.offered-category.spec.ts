import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupService } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';

const INST = 'inst-usta';
const ARTES = 'cat-artes';
const TEATRO = 'cat-teatro';

describe('GroupService — solo se crean grupos de las categorías ofertadas', () => {
  let service: GroupService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      groups: { create: jest.fn().mockResolvedValue({ uid: 'g1' }) },
      usersGroups: { create: jest.fn(), createMany: jest.fn() },
    };

    prisma = {
      institutionCategory: { findUnique: jest.fn() },
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

  it('crea el grupo cuando la institución oferta la categoría', async () => {
    prisma.institutionCategory.findUnique.mockResolvedValue({ uid: 'ic-1' });

    await expect(
      service.createGroupUseCase({ name: 'Taller de óleo', institutionId: INST, categoryId: ARTES }),
    ).resolves.toEqual({ uid: 'g1' });

    expect(tx.groups.create).toHaveBeenCalled();
  });

  // El caso del pedido: la USTA Tunja oferta artes y música, así que un grupo
  // de teatro no se crea aunque la categoría exista en el catálogo global.
  it('rechaza la categoría que la institución no oferta', async () => {
    prisma.institutionCategory.findUnique.mockResolvedValue(null);

    await expect(
      service.createGroupUseCase({ name: 'Grupo de teatro', institutionId: INST, categoryId: TEATRO }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // InstitutionCategory no está scopeado: si el where no llevara el
  // institutionId, alcanzaría con que CUALQUIER institución ofertara la
  // categoría para que la validación pasara.
  it('busca la oferta por el par (institución, categoría)', async () => {
    prisma.institutionCategory.findUnique.mockResolvedValue({ uid: 'ic-1' });

    await service.createGroupUseCase({ name: 'Taller', institutionId: INST, categoryId: ARTES });

    expect(prisma.institutionCategory.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId_categoryId: { institutionId: INST, categoryId: ARTES } },
      }),
    );
  });

  it('valida la categoría antes que los miembros: no consulta membresías si la categoría no se oferta', async () => {
    prisma.institutionCategory.findUnique.mockResolvedValue(null);

    await expect(
      service.createGroupUseCase({
        name: 'Grupo de teatro',
        institutionId: INST,
        categoryId: TEATRO,
        profesorId: 'prof-1',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.userInstitution.findMany).not.toHaveBeenCalled();
  });
});
