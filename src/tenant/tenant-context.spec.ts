import { tenantStorage, runWithoutTenant, TenantStore } from './tenant-context';

describe('tenant-context', () => {
  it('devuelve undefined fuera de un store', () => {
    expect(tenantStorage.getStore()).toBeUndefined();
  });

  it('expone el store dentro de run()', () => {
    const store: TenantStore = { institutionId: 'inst-a', bypass: false };
    tenantStorage.run(store, () => {
      expect(tenantStorage.getStore()?.institutionId).toBe('inst-a');
    });
  });

  it('runWithoutTenant activa bypass adentro y no afecta afuera', () => {
    const store: TenantStore = { institutionId: 'inst-a', bypass: false };
    tenantStorage.run(store, () => {
      runWithoutTenant(() => {
        expect(tenantStorage.getStore()?.bypass).toBe(true);
      });
      expect(tenantStorage.getStore()?.bypass).toBe(false);
    });
  });

  it('conserva el institutionId dentro del bypass', () => {
    const store: TenantStore = { institutionId: 'inst-a', bypass: false };
    tenantStorage.run(store, () => {
      runWithoutTenant(() => {
        expect(tenantStorage.getStore()?.institutionId).toBe('inst-a');
      });
    });
  });

  it('no afecta el store externo aunque la función lance', () => {
    const store: TenantStore = { institutionId: 'inst-a', bypass: false };
    tenantStorage.run(store, () => {
      expect(() => runWithoutTenant(() => { throw new Error('boom'); })).toThrow('boom');
      expect(tenantStorage.getStore()?.bypass).toBe(false);
    });
  });

  it('el bypass sobrevive a continuaciones asíncronas', async () => {
    const store: TenantStore = { institutionId: 'inst-a', bypass: false };
    await tenantStorage.run(store, async () => {
      await runWithoutTenant(async () => {
        await new Promise((r) => setTimeout(r, 5));
        // Tras el await, el store debe seguir siendo el del bypass.
        expect(tenantStorage.getStore()?.bypass).toBe(true);
      });
    });
  });

  it('el bypass sobrevive a un thenable lazy, como PrismaPromise', async () => {
    const store: TenantStore = { institutionId: 'inst-a', bypass: false };
    let bypassAlEjecutar: boolean | undefined;

    // Emula PrismaPromise: no ejecuta nada hasta que lo esperan.
    const lazy = {
      then(onFulfilled: (v: string) => unknown) {
        bypassAlEjecutar = tenantStorage.getStore()?.bypass;
        return Promise.resolve('ok').then(onFulfilled);
      },
    };

    await tenantStorage.run(store, async () => {
      await runWithoutTenant(() => lazy as unknown as Promise<string>);
    });

    expect(bypassAlEjecutar).toBe(true);
  });

  it('no rompe si se llama sin store', () => {
    expect(runWithoutTenant(() => 42)).toBe(42);
  });
});
