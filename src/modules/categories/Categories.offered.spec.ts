import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from './Categories.service';
import { PrismaService } from 'src/prisma/prisma.service';

const INST = 'inst-usta';
const ARTES = { uid: 'cat-artes', name: 'Artes Plásticas', slug: 'artes', iconSlug: 'palette', isActive: true };
const MUSICA = { uid: 'cat-musica', name: 'Música', slug: 'musica', iconSlug: 'music-note', isActive: true };

describe('CategoriesService — categorías ofertadas por la institución', () => {
  let service: CategoriesService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      institutionCategory: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    prisma = {
      groupCategory: { findMany: jest.fn() },
      institutionCategory: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  describe('getOfferedCategories', () => {
    // InstitutionCategory NO está en SCOPED_MODELS: este where es lo único que
    // separa la oferta de una institución de la de todas las demás. Si alguien
    // lo saca, este test es el que avisa.
    it('filtra por institutionId escrito a mano', async () => {
      await service.getOfferedCategories(INST);

      expect(prisma.institutionCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { institutionId: INST } }),
      );
    });

    it('devuelve las categorías, no las filas puente', async () => {
      prisma.institutionCategory.findMany.mockResolvedValue([
        { category: MUSICA },
        { category: ARTES },
      ]);

      await expect(service.getOfferedCategories(INST)).resolves.toEqual([ARTES, MUSICA]);
    });

    it('devuelve lista vacía cuando la institución no oferta nada', async () => {
      await expect(service.getOfferedCategories(INST)).resolves.toEqual([]);
    });
  });

  describe('setOfferedCategories', () => {
    it('borra lo que no vino y crea lo que falta, todo en la misma institución', async () => {
      prisma.groupCategory.findMany.mockResolvedValue([ARTES, MUSICA]);

      await service.setOfferedCategories(INST, [ARTES.uid, MUSICA.uid]);

      expect(tx.institutionCategory.deleteMany).toHaveBeenCalledWith({
        where: { institutionId: INST, categoryId: { notIn: [ARTES.uid, MUSICA.uid] } },
      });
      expect(tx.institutionCategory.createMany).toHaveBeenCalledWith({
        data: [
          { institutionId: INST, categoryId: ARTES.uid },
          { institutionId: INST, categoryId: MUSICA.uid },
        ],
        skipDuplicates: true,
      });
    });

    // "Sin filas" significa "no oferta nada", no "todas": la lista vacía tiene
    // que borrar todo y no crear nada. El where del delete se arma sin `notIn`
    // a propósito — ver el comentario en el service.
    it('la lista vacía borra toda la oferta y no crea nada', async () => {
      await service.setOfferedCategories(INST, []);

      expect(tx.institutionCategory.deleteMany).toHaveBeenCalledWith({
        where: { institutionId: INST },
      });
      expect(tx.institutionCategory.createMany).not.toHaveBeenCalled();
    });

    it('deduplica los ids repetidos', async () => {
      prisma.groupCategory.findMany.mockResolvedValue([ARTES]);

      await service.setOfferedCategories(INST, [ARTES.uid, ARTES.uid]);

      expect(tx.institutionCategory.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ institutionId: INST, categoryId: ARTES.uid }] }),
      );
    });

    it('rechaza una categoría que no existe o está inactiva, sin tocar la base', async () => {
      prisma.groupCategory.findMany.mockResolvedValue([ARTES]);

      await expect(
        service.setOfferedCategories(INST, [ARTES.uid, 'cat-inventada']),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('valida contra el catálogo global pidiendo solo las activas', async () => {
      prisma.groupCategory.findMany.mockResolvedValue([ARTES]);

      await service.setOfferedCategories(INST, [ARTES.uid]);

      expect(prisma.groupCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { uid: { in: [ARTES.uid] }, isActive: true },
        }),
      );
    });
  });
});
