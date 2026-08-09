import { tenantStorage } from 'src/tenant/tenant-context';
import { StylesService } from './Styles.service';

/**
 * Lo único que separa `getMine` de `getAll` es el `runWithoutTenant`, y esa
 * diferencia no se ve leyendo las dos firmas: devuelven la misma forma. Estos
 * tests la fijan, para que nadie "unifique" los dos métodos sin darse cuenta
 * de que uno alimenta la vitrina pública y el otro el dashboard.
 */
describe('StylesService — alcance de las lecturas de lista', () => {
  let service: StylesService;
  let prismaMock: any;
  let seenBypass: boolean | undefined;

  beforeEach(() => {
    seenBypass = undefined;
    prismaMock = {
      styles: {
        // Emula PrismaPromise: lazy, no ejecuta hasta el await.
        findMany: jest.fn(() => ({
          then(onFulfilled: (v: unknown[]) => unknown) {
            seenBypass = tenantStorage.getStore()?.bypass;
            return Promise.resolve([]).then(onFulfilled);
          },
        })),
      },
    };
    service = new StylesService(prismaMock as any);
  });

  it('getAll ejecuta con bypass activo — es la galería pública', async () => {
    await tenantStorage.run({ institutionId: null, bypass: false }, async () => {
      await service.getAll();
    });
    expect(seenBypass).toBe(true);
  });

  it('getAllByGroup ejecuta con bypass activo — también es pública', async () => {
    await tenantStorage.run({ institutionId: null, bypass: false }, async () => {
      await service.getAllByGroup('cat-1');
    });
    expect(seenBypass).toBe(true);
  });

  it('getMine NO activa el bypass: queda a merced del filtro de tenant', async () => {
    await tenantStorage.run({ institutionId: 'inst-a', bypass: false }, async () => {
      await service.getMine();
    });
    expect(seenBypass).toBe(false);
  });

  it('getAll no deja el bypass activo en el store externo', async () => {
    const store = { institutionId: null as string | null, bypass: false };
    await tenantStorage.run(store, async () => {
      await service.getAll();
    });
    expect(store.bypass).toBe(false);
  });
});
