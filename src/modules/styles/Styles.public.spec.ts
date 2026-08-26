import { StylesService } from './Styles.service';

/**
 * `Styles` es un catálogo de plataforma desde el 2026-08-24: salió de
 * `SCOPED_MODELS` y perdió `groupId` e `institutionId`. Estos tests fijan las
 * dos consecuencias que no se ven leyendo las firmas:
 *
 * 1. Ninguna lectura usa `runWithoutTenant()`. Antes hacía falta para que la
 *    galería pública viera los estilos de todas las instituciones; hoy no hay
 *    extensión de tenant que esquivar, y volver a meter el bypass sería
 *    apagar un filtro que ya no existe.
 * 2. Ninguna lectura filtra ni deduplica por nombre. Mientras el catálogo
 *    colgaba del grupo existía repetido una vez por grupo de artes y
 *    `getAll` tenía que colapsarlo con `distinct: ['name']`. La migración
 *    `20260824190000_styles_catalogo_por_categoria` borró las copias, y el
 *    único filtro que queda es la categoría.
 */
describe('StylesService — lecturas del catálogo', () => {
  let service: StylesService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      styles: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ uid: 's1' }),
      },
    };
    service = new StylesService(prismaMock as any);
  });

  const argsDe = (mock: jest.Mock) => mock.mock.calls[0][0];

  it('getAll devuelve el catálogo activo ordenado, sin distinct por nombre', async () => {
    await service.getAll();

    const args = argsDe(prismaMock.styles.findMany);
    expect(args.where).toEqual({ isActive: true });
    expect(args.orderBy).toEqual({ name: 'asc' });
    // El nombre puede repetirse ENTRE categorías: "Contemporáneo" en Danzas y
    // en Música son dos estilos distintos y los dos tienen que aparecer.
    expect(args.distinct).toBeUndefined();
  });

  it('getAllByCategory filtra por categoría y por activo', async () => {
    await service.getAllByCategory('cat-1');

    expect(argsDe(prismaMock.styles.findMany).where).toEqual({
      categoryId: 'cat-1',
      isActive: true,
    });
  });

  it('ninguna lectura pide institución ni grupo', async () => {
    await service.getAll();
    await service.getAllByCategory('cat-1');

    for (const call of prismaMock.styles.findMany.mock.calls) {
      const where = call[0].where ?? {};
      expect(where).not.toHaveProperty('institutionId');
      expect(where).not.toHaveProperty('groupId');
      expect(call[0].select).not.toHaveProperty('groupId');
      expect(call[0].select).not.toHaveProperty('institutionId');
    }
  });

  it('crear un estilo solo necesita nombre, descripción y categoría', async () => {
    prismaMock.styles.create = jest.fn().mockResolvedValue({ uid: 's9' });

    await service.create({
      name: 'Acuarela',
      description: 'Pigmentos diluidos en agua.',
      categoryId: 'cat-1',
    });

    expect(prismaMock.styles.create).toHaveBeenCalledWith({
      data: {
        name: 'Acuarela',
        description: 'Pigmentos diluidos en agua.',
        categoryId: 'cat-1',
      },
      select: { uid: true },
    });
  });
});
