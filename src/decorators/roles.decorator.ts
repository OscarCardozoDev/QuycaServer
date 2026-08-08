import { SetMetadata } from '@nestjs/common';

export type RoleName =
  | 'super_admin'
  | 'institution'
  | 'professor'
  | 'user';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
