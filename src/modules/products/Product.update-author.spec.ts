import { NotFoundException } from '@nestjs/common';
import { tenantStorage } from 'src/tenant/tenant-context';
import { ProductService } from './Product.service';

/**
 * `PUT /products/update/:uid` lo pueden llamar los cuatro roles que producen
 * obra, así que el rol no alcanza para decidir: la obra tiene que ser del que
 * edita. Ver obsidian/Raw/Specs/2026-08-23-matriz-de-permisos-design.md §3.11.
 */
describe('ProductService.updateProductUseCase — solo el autor edita', () => {
  let service: ProductService;
  let prismaMock: any;
  let seenWhere: Record<string, unknown> | undefined;

  const run = (userId: string) =>
    tenantStorage.run({ institutionId: 'inst-1', bypass: false }, () =>
      service.updateProductUseCase({
        productId: 'prod-1',
        userId,
        data: { name: 'nuevo nombre' },
      }),
    );

  beforeEach(() => {
    seenWhere = undefined;
    prismaMock = {
      products: {
        findFirst: jest.fn((args: { where: Record<string, unknown> }) => {
          seenWhere = args.where;
          // Solo 'autor-1' figura en UserProduct para 'prod-1'.
          const authors = args.where.authors as { some: { userId: string } };
          return Promise.resolve(
            authors.some.userId === 'autor-1'
              ? { uid: 'prod-1', groupId: 'grupo-1', photos: [] }
              : null,
          );
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          products: { update: jest.fn().mockResolvedValue({ uid: 'prod-1' }) },
        }),
      ),
    };
    service = new ProductService(prismaMock, {} as any);
  });

  it('el filtro de autoría va en el where, no en un if posterior', async () => {
    await run('autor-1');

    expect(seenWhere).toEqual({
      uid: 'prod-1',
      authors: { some: { userId: 'autor-1' } },
    });
  });

  it('el autor edita su obra', async () => {
    await expect(run('autor-1')).resolves.toBeDefined();
  });

  it('a quien no es autor le responde 404, no 403', async () => {
    // Un 403 confirmaría que la obra existe. Mismo criterio que
    // assertCanViewGroup con el segundo eje de aislamiento.
    await expect(run('otro-usuario')).rejects.toBeInstanceOf(NotFoundException);
  });
});
