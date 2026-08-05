import { SetMetadata } from '@nestjs/common';

export type RoleName =
  | 'student'
  | 'professor'
  | 'admin'
  | 'super_admin'
  | 'institution'
  | 'user';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
