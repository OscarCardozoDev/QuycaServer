import { SetMetadata } from '@nestjs/common';

export const CONTEXT_ROLE_KEY = 'contextRole';
export const RequireContextRole = (...roles: string[]) =>
  SetMetadata(CONTEXT_ROLE_KEY, roles);
