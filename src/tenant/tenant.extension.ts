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

const WHERE_OPERATIONS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow',
  'findMany', 'count', 'aggregate', 'groupBy',
  'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);

const DATA_OPERATIONS = new Set(['create', 'createMany']);

/**
 * Devuelve una copia de `args` con el filtro de tenant aplicado.
 *
 * Prisma 5+ admite campos no únicos junto al campo único en el `where` de
 * findUnique, update y delete (extendedWhereUnique), así que se inyecta
 * uniformemente en lugar de verificar la propiedad después de la consulta.
 */
export function buildScopedArgs(
  operation: string,
  args: any,
  institutionId: string,
): any {
  const next = { ...(args ?? {}) };

  if (WHERE_OPERATIONS.has(operation)) {
    next.where = { AND: [next.where ?? {}, { institutionId }] };
  }

  if (DATA_OPERATIONS.has(operation)) {
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

export function applyTenantScope<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'tenantScope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const action = resolveTenantAction(model);
          if (action.skip) return query(args);
          return query(buildScopedArgs(operation, args, action.institutionId));
        },
      },
    },
  });
}
