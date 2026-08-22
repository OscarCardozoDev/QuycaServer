import { SetMetadata } from '@nestjs/common';

export const CROSS_TENANT_KEY = 'allowCrossTenant';

/**
 * Marca un endpoint que consulta modelos scoped sin filtro de tenant.
 * Reservado para SUPER_ADMIN. Requiere CrossTenantGuard en el controller.
 */
export const AllowCrossTenant = () => SetMetadata(CROSS_TENANT_KEY, true);
