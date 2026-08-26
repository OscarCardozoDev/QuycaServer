import { tenantStorage } from 'src/tenant/tenant-context';
import { ProductService } from './Product.service';

describe('ProductService.getMine — bandeja propia, todos los estados', () => {
  let service: ProductService;
  let prismaMock: any;
  let seenBypass: boolean | undefined;
  let seenWhere: Record<string, unknown> | undefined;

  beforeEach(() => {
    seenBypass = undefined;
    seenWhere = undefined;
    prismaMock = {
      products: {
        // Emula PrismaPromise: lazy, no ejecuta hasta el await.
        findMany: jest.fn((args: { where: Record<string, unknown> }) => ({
          then(onFulfilled: (v: unknown[]) => unknown) {
            seenBypass = tenantStorage.getStore()?.bypass;
            seenWhere = args.where;
            return Promise.resolve([]).then(onFulfilled);
          },
        })),
      },
    };
    service = new ProductService(prismaMock, {} as any);
  });

  it('corre sin bypass — hereda el institutionId de la extensión', async () => {
    const store = { institutionId: 'inst-1', bypass: false };
    await tenantStorage.run(store, async () => {
      await service.getMine('user-1');
    });

    expect(seenBypass).toBe(false);
  });

  it('el where NO filtra por status — vienen todos los estados', async () => {
    await tenantStorage.run(
      { institutionId: 'inst-1', bypass: false },
      async () => {
        await service.getMine('user-1');
      },
    );

    expect(seenWhere).not.toHaveProperty('status');
  });

  it('el where filtra por el userId recibido', async () => {
    await tenantStorage.run(
      { institutionId: 'inst-1', bypass: false },
      async () => {
        await service.getMine('user-1');
      },
    );

    expect(seenWhere?.authors).toEqual({ some: { userId: 'user-1' } });
  });

  it('acota al grupo activo cuando llega groupId', async () => {
    await tenantStorage.run(
      { institutionId: 'inst-1', bypass: false },
      async () => {
        await service.getMine('user-1', { groupId: 'grp-musica' });
      },
    );

    expect(seenWhere?.groupId).toBe('grp-musica');
  });

  it('sin groupId no filtra por grupo — la bandeja completa de la institución', async () => {
    await tenantStorage.run(
      { institutionId: 'inst-1', bypass: false },
      async () => {
        await service.getMine('user-1');
      },
    );

    expect(seenWhere).not.toHaveProperty('groupId');
  });
});
