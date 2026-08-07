import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  institutionId: string | null;
  bypass: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

/**
 * Ejecuta `fn` sin filtro de tenant. Para endpoints públicos y SUPER_ADMIN.
 *
 * Usa `tenantStorage.run` con un store nuevo en lugar de mutar y restaurar el
 * actual. Los métodos de Prisma devuelven PrismaPromise, que es lazy: no
 * ejecuta hasta el await. Con mutar-y-restaurar, el bypass volvería a false
 * antes de que la extensión evalúe la operación.
 *
 * `run()` solo propaga el store a operaciones asíncronas *creadas* mientras
 * `fn` corre de forma síncrona (así lo documenta Node: "the store persists
 * for the entire synchronous execution and any nested async operations
 * spawned during that execution"). Si `fn` simplemente devuelve un thenable
 * ya existente (como un PrismaPromise) sin tocarlo, no se "crea" nada dentro
 * de `run()` — el `.then()` real lo dispara quien llama, con el `await`,
 * que ocurre después de que `run()` ya devolvió y restauró el store externo.
 *
 * Por eso, si el resultado de `fn` es un thenable, se le llama `.then` de
 * inmediato aquí adentro — todavía con el bypass activo — envolviéndolo en
 * una Promise nativa. Eso engancha la resolución lazy de Prisma al store
 * correcto, sin mutar `bypass` y sin forzar un `await` que rompería el caso
 * síncrono.
 *
 * LIMITACIÓN: el valor devuelto es una `Promise` nativa, no el `PrismaPromise`
 * original. `PrismaPromise` expone un método interno `requestTransaction()`
 * que la forma en arreglo de `prisma.$transaction([...])` necesita para
 * encolar la query en una transacción por lote; una `Promise` nativa no lo
 * tiene. Por eso, el valor que devuelve `runWithoutTenant` NO debe pasarse
 * dentro de `prisma.$transaction([...])`. La forma callback,
 * `$transaction(async (tx) => ...)`, no se ve afectada — no depende de
 * `requestTransaction()` — y es, además, la única forma usada hoy en este
 * codebase (todos los `$transaction` actuales son de la forma callback).
 */
export function runWithoutTenant<T>(fn: () => T): T {
  const current = tenantStorage.getStore();
  const store: TenantStore = { institutionId: current?.institutionId ?? null, bypass: true };
  return tenantStorage.run(store, () => {
    const result = fn();
    if (isThenable(result)) {
      return new Promise((resolve, reject) => result.then(resolve, reject)) as T;
    }
    return result;
  });
}
