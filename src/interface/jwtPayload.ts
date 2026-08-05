import { Request } from 'express';
import type { Institution, SubscriptionPlan } from 'src/generated/prisma/client';

export interface JwtPayload {
  sub: string;
  uid: string;
  userTypeId?: string | null;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  institutionSlug?: string | null;
  institution?: Institution & { subscriptionPlan: SubscriptionPlan };
  contextRole?: string;
}
