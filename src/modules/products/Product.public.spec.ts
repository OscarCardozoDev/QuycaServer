import { tenantStorage } from 'src/tenant/tenant-context';
import { ProductService } from './Product.service';

describe('ProductService — lecturas públicas', () => {
  let service: ProductService;
  let prismaMock: any;
  let seenBypass: boolean | undefined;

  beforeEach(() => {
    seenBypass = undefined;
    prismaMock = {
      products: {
        // Emula PrismaPromise: lazy, no ejecuta hasta el await.
        findMany: jest.fn(() => ({
          then(onFulfilled: (v: unknown[]) => unknown) {
            seenBypass = tenantStorage.getStore()?.bypass;
            return Promise.resolve([]).then(onFulfilled);
          },
        })),
      },
    };
    service = new ProductService(prismaMock as any, {} as any);
  });

  it('getGalleryHome ejecuta la consulta con bypass activo', async () => {
    await tenantStorage.run({ institutionId: null, bypass: false }, async () => {
      await service.getGalleryHome();
    });
    expect(seenBypass).toBe(true);
  });

  it('no deja el bypass activo en el store externo', async () => {
    const store = { institutionId: null as string | null, bypass: false };
    await tenantStorage.run(store, async () => {
      await service.getGalleryHome();
    });
    expect(store.bypass).toBe(false);
  });

  // El bug que originó estos tests: la galería sin filtro no mostraba NINGUNA
  // obra aprobada que no tuviera estilos cargados, porque el `some` quedaba
  // igual en el where con `styleId` undefined.
  const whereDe = (mock: jest.Mock) => mock.mock.calls[0][0].where;

  it('sin styleId no filtra por estilo', async () => {
    await service.getGalleryHome();

    const where = whereDe(prismaMock.products.findMany);
    expect(where).toEqual({ isActive: true, status: 'APPROVED' });
    expect(where.styles).toBeUndefined();
  });

  it('con styleId filtra por ese estilo, sin perder aprobada + activa', async () => {
    await service.getGalleryHome({ styleId: 'style-1' });

    // Por uid y no por nombre: desde que el catálogo es de plataforma, un
    // estilo existe una sola vez y no hay copias que reconciliar.
    expect(whereDe(prismaMock.products.findMany)).toEqual({
      isActive: true,
      status: 'APPROVED',
      styles: { some: { styleId: 'style-1' } },
    });
  });

  it('getAll tampoco publica obras sin aprobar', async () => {
    await service.getAll();

    expect(whereDe(prismaMock.products.findMany)).toEqual({
      isActive: true,
      status: 'APPROVED',
    });
  });
});
