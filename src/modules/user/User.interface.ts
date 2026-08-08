// server/src/modules/user/User.interface.ts

export interface User {
  uid: string;
  name: string;
  lastName: string;
  username: string;
  description?: string | null;
  gender: string;
  telNumber: string;
  isActive: boolean;
  userTypeId: string;
  photoId?: string | null;
  roleId?: string | null;
  roleData?: unknown;
}

export interface AuthorInfo {
  uid: string;
  name: string;
  lastName: string;
  username: string;
  description?: string | null;
  photoId?: string | null;
  photo?: { uid: string; url?: string } | null;
}

export interface UserWithRelations extends User {
  userType?: { uid: string; name?: string } | null;
  photo?: { uid: string; url?: string } | null;
  role?: { uid: string; name?: string; slug?: string } | null;
  groups?: { group: { uid: string; name?: string } }[] | null;
}

export interface CreateStudentUseCase {
  uid: string;
  user: {
    name: string;
    lastName: string;
    username: string;
    description?: string;
    gender: string;
    telNumber: string;
    roleData: unknown;
  };
  photo?: { base64: string; name: string; folder: string };
}

export interface UpdateUserUseCase {
  name?: string;
  lastName?: string;
  username?: string;
  description?: string;
  gender?: string;
  telNumber?: string;
}

export interface UserUidResult {
  uid: string;
  photo?: { uid: string };
}
