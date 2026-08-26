import { tenantStorage } from 'src/tenant/tenant-context';
import { EventService } from './Event.service';

const GROUP = 'g-artes';

// Espejo de Product.group-private.spec.ts: el riesgo de copiar-y-pegar el
// bypass desde el método público es idéntico para eventos, así que se cubre
// con el mismo patrón — ver spec 2026-08-12-pantalla-del-grupo-design § 6.3.
describe('EventService — la lectura privada por grupo no lleva bypass', () => {
  let service: EventService;
  let prismaMock: any;
  let seenBypass: boolean | undefined;

  beforeEach(() => {
    seenBypass = undefined;
    prismaMock = {
      events: {
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
    service = new EventService(prismaMock as any, {} as any);
  });

  it('corre sin bypass activo, a diferencia del método público', async () => {
    const store = { institutionId: 'inst-1', bypass: false };
    await tenantStorage.run(store, async () => {
      await service.getByGroupPrivate(GROUP, {});
    });

    expect(seenBypass).toBe(false);
  });

  it('consulta por groupId, dejando que la extensión agregue el institutionId', async () => {
    await service.getByGroupPrivate(GROUP, {});

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groups: { some: { groupId: GROUP } },
        }),
      }),
    );
  });

  it('el método público sigue existiendo y no se tocó', () => {
    expect(typeof service.getByGroup).toBe('function');
  });
});
