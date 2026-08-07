import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from 'src/generated/prisma/client';
import { tenantStorage } from './tenant-context';

/**
 * Modelos con columna `institutionId` que deben filtrarse por tenant.
 *
 * NO agregar Institution, UserInstitution ni InstitutionInvitation: son los
 * modelos que establecen el tenant. Filtrarlos crea dependencia circular —
 * el TenantGuard los consulta para resolver la institución.
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
 * Devuelve una copia de `args` con el filtro de tenant aplicado.
 *
 * Prisma 5+ admite campos no únicos junto al campo único en el `where` de
 * findUnique, update y delete (extendedWhereUnique), así que se inyecta
 * uniformemente en lugar de verificar la propiedad después de la consulta.
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
    next.where = { AND: [next.where ?? {}, { institutionId }] };
  }

  if (isDataOp) {
    next.data = Array.isArray(next.data)
      ? next.data.map((row: any) => ({ ...row, institutionId }))
      : { ...next.data, institutionId };
  }

  // upsert crea si no existe: la fila nueva también lleva el tenant.
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
