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
});
