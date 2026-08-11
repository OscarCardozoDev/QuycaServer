import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from 'src/generated/prisma/client';
import { tenantStorage } from './tenant-context';

/**
 * Modelos con columna `institutionId` que deben filtrarse por tenant.
 *
 * NO agregar Institution, UserInstitution ni InstitutionInvitation: son los
 * modelos que establecen el tenant. Filtrarlos crea dependencia circular —
 * el TenantGuard los consulta para resolver la institución.
 *
 * NO agregar InstitutionCategory tampoco, aunque tenga columna institutionId.
 * Es configuración DE la institución, de la misma familia que UserInstitution,
 * y sus caminos de acceso viven fuera de un tenant resuelto:
 *
 *   1. Se escribe en `POST /institutions`, que es público: el TenantMiddleware
 *      ya abrió el store pero con institutionId null, así que un modelo scoped
 *      tiraría 403 justo al sembrar las categorías por defecto de la
 *      institución recién creada. Habría que envolver el alta entera en
 *      runWithoutTenant().
 *   2. La vitrina pública "qué oferta cada institución" lee las filas de OTRAS
 *      instituciones — otro runWithoutTenant().
 *   3. Los dos caminos que sí son del tenant activo (leer y editar la oferta
 *      propia, validar la categoría al crear un grupo) ya reciben el
 *      institutionId explícito del TenantGuard vía @Institution(), así que la
 *      extensión no agregaría nada que el where no diga ya.
 *
 * Es decir: scopearlo convertiría la excepción en la regla. Además lo que
 * guarda es catálogo, no dato sensible — qué categorías dicta una institución
 * es información tan pública como su nombre.
 *
 * A cambio: TODO filtro sobre InstitutionCategory va escrito a mano. Si
 * escribís una query sobre este modelo sin `where: { institutionId }`, ves las
 * de todas las instituciones y nadie te avisa.
 */
export const SCOPED_MODELS = new Set<string>([
  'Groups',
  'Events',
  'Products',
  'Styles',
  'Classes',
  'Schedule',
  'Attendance',
  'ContentRequest',
]);

export type TenantAction =
  | { skip: true }
  | { skip: false; institutionId: string };

export function resolveTenantAction(model: string | undefined): TenantAction {
  if (!model || !SCOPED_MODELS.has(model)) return { skip: true };

  const store = tenantStorage.getStore();

  // Sin store = fuera de un request HTTP (seed, migración, script CLI).
  if (!store) return { skip: true };

  if (store.bypass) return { skip: true };

  if (!store.institutionId) {
    throw new ForbiddenException(
      `Tenant context required to query "${model}". ` +
        `Use runWithoutTenant() for public endpoints or @AllowCrossTenant() for SUPER_ADMIN.`,
    );
  }

  return { skip: false, institutionId: store.institutionId };
}

// Catálogo completo de operaciones de Prisma-for-Postgres (excluye findRaw y
// aggregateRaw, que son exclusivas de MongoDB y no aplican a este proyecto).
// Cerrado deliberadamente: una operación fuera de estas dos listas lanza en
// buildScopedArgs en lugar de pasar sin filtrar — ver el comentario ahí.
const WHERE_OPERATIONS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow',
  'findMany', 'count', 'aggregate', 'groupBy',
  'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany', 'upsert',
]);

const DATA_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

/**
 * Subconjunto de WHERE_OPERATIONS cuyo `where` es un `<Model>WhereUniqueInput`
 * en vez de un `<Model>WhereInput`.
 *
 * Prisma valida que un WhereUniqueInput tenga al menos un campo único como
 * propiedad DIRECTA del objeto. `{ AND: [{ uid }, { institutionId }] }` no
 * cumple esa condición aunque el `uid` esté adentro del array, y Prisma lanza
 * `PrismaClientValidationError: Argument 'where' ... needs at least one of
 * 'uid' arguments`. Por eso acá el filtro se mezcla plano
 * (`{ ...where, institutionId }`), que es la forma que extendedWhereUnique sí
 * acepta. El resto de las operaciones toma WhereInput, que no tiene esa
 * restricción, y se sigue envolviendo en AND.
 */
const UNIQUE_WHERE_OPERATIONS = new Set([
  'findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert',
]);

/**
 * Devuelve una copia de `args` con el filtro de tenant aplicado.
 *
 * Prisma 5+ admite campos no únicos junto al campo único en el `where` de
 * findUnique, update y delete (extendedWhereUnique), así que se inyecta
 * uniformemente en lugar de verificar la propiedad después de la consulta.
 * La forma de la inyección depende del tipo de `where` — ver
 * UNIQUE_WHERE_OPERATIONS.
 *
 * Falla cerrado: si `operation` no está en WHERE_OPERATIONS ni en
 * DATA_OPERATIONS, lanza en lugar de devolver `args` sin tocar. Sin este
 * chequeo, una operación nueva de una versión futura de Prisma pasaría sin
 * filtro de tenant de forma silenciosa — el mismo riesgo que
 * resolveTenantAction cierra para el caso "sin institutionId".
 */
export function buildScopedArgs(
  operation: string,
  args: any,
  institutionId: string,
  model?: string,
): any {
  const isWhereOp = WHERE_OPERATIONS.has(operation);
  const isDataOp = DATA_OPERATIONS.has(operation);

  if (!isWhereOp && !isDataOp) {
    throw new Error(
      `Unrecognized Prisma operation "${operation}" on scoped model "${model ?? 'unknown'}". ` +
        `Add it to WHERE_OPERATIONS or DATA_OPERATIONS in tenant.extension.ts ` +
        `after confirming how it should be scoped.`,
    );
  }

  const next = { ...(args ?? {}) };

  if (isWhereOp) {
    // institutionId va último en la forma plana: sobrescribe el que haya
    // provisto el caller, igual que en las operaciones de data.
    next.where = UNIQUE_WHERE_OPERATIONS.has(operation)
      ? { ...(next.where ?? {}), institutionId }
      : { AND: [next.where ?? {}, { institutionId }] };
  }

  if (isDataOp) {
    next.data = Array.isArray(next.data)
      ? next.data.map((row: any) => ({ ...row, institutionId }))
      : { ...next.data, institutionId };
  }

  // upsert crea si no existe: la fila nueva también lleva el tenant.
  // Efecto de borde deliberado: si el `where` apunta a una fila de OTRA
  // institución, el filtro hace que no matchee y upsert toma la rama create —
  // se crea una fila nueva en el tenant activo en vez de modificar la ajena.
  // No hay escritura cross-tenant, que es la garantía que importa acá.
  if (operation === 'upsert') {
    next.create = { ...next.create, institutionId };
  }

  return next;
}

/**
 * Decide qué argumentos pasarle a Prisma para esta operación sobre `model`.
 *
 * Sin cambios si el modelo no está scoped, o si no corresponde filtrar
 * (sin store, bypass activo — ver resolveTenantAction). Reescritos con el
 * tenant activo en cualquier otro caso. El chequeo de "operación
 * desconocida" de buildScopedArgs solo se alcanza aquí abajo, así que solo
 * dispara cuando el modelo está scoped y hay un tenant resuelto — nunca
 * para modelos fuera de SCOPED_MODELS, sin store o bajo bypass.
 */
export function resolveScopedArgs(
  model: string | undefined,
  operation: string,
  args: any,
): any {
  const action = resolveTenantAction(model);
  if (action.skip) return args;
  return buildScopedArgs(operation, args, action.institutionId, model);
}

export function applyTenantScope<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'tenantScope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(resolveScopedArgs(model, operation, args));
        },
      },
    },
  });
}
