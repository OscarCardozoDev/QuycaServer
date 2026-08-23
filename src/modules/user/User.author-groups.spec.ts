import { tenantStorage } from 'src/tenant/tenant-context';
import { UserService } from './User.service';

describe('UserService.getInfoAuthor — grupos del autor', () => {
  let service: UserService;
  let prismaMock: any;
  let seenBypass: boolean | undefined;
  let seenSelect: any;

  const fakeUser = {
    uid: 'author-1',
    name: 'Ana',
    lastName: 'Diaz',
    username: 'ana',
    description: null,
    photoId: null,
    photo: null,
    groups: [
      {
        group: {
          uid: 'group-1',
          name: 'Escultura I',
          description: 'Taller de escultura',
          coverPhoto: { url: 'http://x/cover.jpg' },
          groupCategory: { name: 'Escultura', slug: 'escultura' },
          institution: { name: 'USTA', slug: 'usta' },
        },
      },
    ],
  };

  beforeEach(() => {
    seenBypass = undefined;
    seenSelect = undefined;
    prismaMock = {
      users: {
        findUnique: jest.fn(({ select }: any) => {
          seenSelect = select;
          // Emula PrismaPromise: lazy, no ejecuta hasta el await.
          return {
            then(onFulfilled: (v: unknown) => unknown) {
              seenBypass = tenantStorage.getStore()?.bypass;
              return Promise.resolve(fakeUser).then(onFulfilled);
            },
          };
        }),
      },
    };
    service = new UserService(prismaMock, {} as any, {} as any);
  });

  it('el select no pide users ni _count del grupo', async () => {
    await tenantStorage.run(
      { institutionId: null, bypass: false },
      async () => {
        await service.getInfoAuthor('author-1');
      },
    );

    const groupSelect = seenSelect.groups.select.group.select;
    expect(groupSelect.users).toBeUndefined();
    expect(groupSelect._count).toBeUndefined();
  });

  it('solo entran grupos con isActive: true', async () => {
    await tenantStorage.run(
      { institutionId: null, bypass: false },
      async () => {
        await service.getInfoAuthor('author-1');
      },
    );

    expect(seenSelect.groups.where).toEqual({ group: { isActive: true } });
  });

  it('la consulta corre con bypass activo (runWithoutTenant)', async () => {
    await tenantStorage.run(
      { institutionId: null, bypass: false },
      async () => {
        await service.getInfoAuthor('author-1');
      },
    );

    expect(seenBypass).toBe(true);
  });

  it('aplana groups: devuelve Group[], no [{ group }]', async () => {
    const result = await tenantStorage.run(
      { institutionId: null, bypass: false },
      () => service.getInfoAuthor('author-1'),
    );

    expect(result.groups).toEqual([
      {
        uid: 'group-1',
        name: 'Escultura I',
        description: 'Taller de escultura',
        coverPhoto: { url: 'http://x/cover.jpg' },
        groupCategory: { name: 'Escultura', slug: 'escultura' },
        institution: { name: 'USTA', slug: 'usta' },
      },
    ]);
  });
});
