import { tenantStorage } from 'src/tenant/tenant-context';
import { ProductService } from './Product.service';

const GROUP = 'g-artes';

describe('ProductService — la lectura privada por grupo no lleva bypass', () => {
  let service: ProductService;
  let prismaMock: any;
  let seenBypass: boolean | undefined;

  beforeEach(() => {
    seenBypass = undefined;
    prismaMock = {
      products: {
        // Emula PrismaPromise: lazy, no ejecuta hasta el await. Solo así se
        // puede capturar el store vigente en el momento en que la consulta
        // efectivamente corre (ver tenant-context.ts).
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

  // El test que importa: si alguien copia y pega el metodo publico, el
  // runWithoutTenant se cuela y este assert lo caza. Se comprueba por el
  // efecto observable — que la consulta corre SIN store de bypass, dejando
  // que la extensión inyecte el institutionId — no por espiar la función.
  it('corre sin bypass activo, a diferencia del método público', async () => {
    const store = { institutionId: 'inst-1', bypass: false };
    await tenantStorage.run(store, async () => {
      await service.getAllByGroupPrivate(GROUP, {});
    });

    expect(seenBypass).toBe(false);
  });

  it('consulta por groupId, dejando que la extensión agregue el institutionId', async () => {
    await service.getAllByGroupPrivate(GROUP, {});

    expect(prismaMock.products.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: GROUP } }),
    );
  });

  it('el método público sigue existiendo y no se tocó', () => {
    expect(typeof service.getAllByGroup).toBe('function');
  });
});
