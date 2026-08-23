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
  // Grupos del autor, aplanados desde el puente UsersGroups. Solo lo público
  // de un grupo cerrado — nunca la lista de estudiantes. Ver
  // UserService.getInfoAuthor.
  groups: {
    uid: string;
    name: string;
    description: string | null;
    coverPhoto: { url: string } | null;
    groupCategory: { name: string; slug: string } | null;
    institution: { name: string; slug: string };
  }[];
}

export interface UserWithRelations extends User {
  userType?: { uid: string; name?: string } | null;
  photo?: { uid: string; url?: string } | null;
  role?: { uid: string; name?: string; slug?: string } | null;
  groups?: { group: { uid: string; name?: string } }[] | null;
  // Solo lo devuelve getActiveUsers, acotado a la institución consultada: es
  // el rol del usuario EN esa institución, y es lo único que distingue a un
  // profesor invitado de un artista autodidacta.
  userInstitutions?: { contextRole: string; joinedAt: Date }[] | null;
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

export interface UserUidResult {
  uid: string;
  photo?: { uid: string };
}
