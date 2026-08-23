import { tenantStorage } from 'src/tenant/tenant-context';
import { EventService } from './Event.service';
import { EventStatus, EventType } from './Event.interface';

const AUTHOR = 'author-1';

// getByAuthor alimenta el portafolio público del artista: "participó" =
// tiene una obra propia expuesta (EventProduct → Products → UserProduct),
// nunca EventInvitation ACCEPTED del grupo (ver plan
// 2026-08-22-portafolio-del-artista.md, Tarea 3).
describe('EventService — eventos en los que participó un autor', () => {
  let service: EventService;
  let prismaMock: any;
  let seenBypass: boolean | undefined;
  let resolvedEvents: unknown[];

  beforeEach(() => {
    seenBypass = undefined;
    resolvedEvents = [];
    prismaMock = {
      events: {
        // Emula PrismaPromise: lazy, no ejecuta hasta el await. Solo así se
        // puede capturar el store vigente en el momento en que la consulta
        // efectivamente corre (ver tenant-context.ts).
        findMany: jest.fn(() => ({
          then(onFulfilled: (v: unknown[]) => unknown) {
            seenBypass = tenantStorage.getStore()?.bypass;
            return Promise.resolve(resolvedEvents).then(onFulfilled);
          },
        })),
      },
    };
    service = new EventService(prismaMock as any, {} as any);
  });

  it('corre con bypass activo (endpoint público)', async () => {
    const store = { institutionId: null as string | null, bypass: false };
    await tenantStorage.run(store, async () => {
      await service.getByAuthor(AUTHOR);
    });

    expect(seenBypass).toBe(true);
    // El bypass no se filtra hacia el store externo.
    expect(store.bypass).toBe(false);
  });

  it('el where filtra status APPROVED/COMPLETED — un PENDING no es una participación', async () => {
    await service.getByAuthor(AUTHOR);

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          status: { in: [EventStatus.APPROVED, EventStatus.COMPLETED] },
          products: {
            some: { product: { authors: { some: { userId: AUTHOR } } } },
          },
        }),
      }),
    );
  });

  it('worksCount cuenta solo las obras del autor, no todas las del evento', async () => {
    // El select ya llega filtrado por authors.some.userId (verificado abajo),
    // así que Prisma solo devolvería acá la obra del propio autor aunque el
    // evento tenga obras de otro autor también expuestas.
    resolvedEvents = [
      {
        uid: 'event-1',
        name: 'Salón de fin de año',
        eventType: EventType.EXHIBITION,
        startDate: new Date('2026-01-01'),
        endDate: null,
        isVirtual: false,
        locationUrl: null,
        products: [{ product: { uid: 'work-author', name: 'Obra del autor' } }],
      },
    ];

    const result = await service.getByAuthor(AUTHOR);

    expect(result).toHaveLength(1);
    expect(result[0].worksCount).toBe(1);
    expect(result[0].works).toEqual([
      { uid: 'work-author', name: 'Obra del autor' },
    ]);

    // El select de `products` (las obras que cuenta) está acotado al autor,
    // no a todas las obras del evento.
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          products: {
            where: { product: { authors: { some: { userId: AUTHOR } } } },
            select: { product: { select: { uid: true, name: true } } },
          },
        }),
      }),
    );
  });
});
