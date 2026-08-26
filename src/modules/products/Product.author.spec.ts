import { tenantStorage } from 'src/tenant/tenant-context';
import { ProductService } from './Product.service';

describe('ProductService.getAllByAuthor — bug de privacidad', () => {
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

  it('el where filtra status APPROVED e isActive true', async () => {
    await tenantStorage.run(
      { institutionId: null, bypass: false },
      async () => {
        await service.getAllByAuthor('author-uid');
      },
    );

    expect(seenWhere?.status).toBe('APPROVED');
    expect(seenWhere?.isActive).toBe(true);
    expect(seenWhere?.group).toEqual({ isActive: true });
  });

  it('ejecuta la consulta con bypass activo (runWithoutTenant)', async () => {
    await tenantStorage.run(
      { institutionId: null, bypass: false },
      async () => {
        await service.getAllByAuthor('author-uid');
      },
    );

    expect(seenBypass).toBe(true);
  });
});
