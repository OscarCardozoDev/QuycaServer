import { ForbiddenException } from '@nestjs/common';
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
