import { Request } from 'express';
import type { Institution, SubscriptionPlan } from 'src/generated/prisma/client';

export interface JwtPayload {
  sub: string;
  uid: string;
  userTypeId?: string | null;
  iat?: number;
  exp?: number;
}

/**
 * La institución activa tal como la deja `TenantGuard` en el request y la
 * devuelve el decorador `@Institution()`: siempre con su plan incluido, porque
 * el guard la consulta con `include: { subscriptionPlan: true }`.
 *
 * Existe para no repetir la intersección en cada firma de controller. Antes
 * estaba escrita a mano 17 veces y una sola de esas lee `subscriptionPlan`.
 */
export type ActiveInstitution = Institution & { subscriptionPlan: SubscriptionPlan };

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  institutionSlug?: string | null;
  institution?: ActiveInstitution;
  contextRole?: string;
}
