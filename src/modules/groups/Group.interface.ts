/* =========================
 * PARAMS / OPTIONS
 * ========================= */

export interface GroupParams {
  uid: string; // ← solo una declaración
}

export interface GetGroupsOptions {
  page?: number;
  limit?: number;
  institutionId?: string;
}

export interface GroupStudentParams {
  groupId: string;
  userId: string;
}

/* =========================
 * CASOS DE USO
 * ========================= */

export interface CreateGroupUseCase {
  name: string;
  profesorId?: string;
  institutionId: string;
  categoryId: string;
  users?: string[];
  description?: string;
  rules?: string;
  coverPhotoId?: string;
  /**
   * Tope de grupos del plan de la institución. `null` = sin límite, y así
   * queda: el plan `empirico` es el de quyca-platform, ponerle tope sería un
   * tope global de la plataforma.
   */
  maxGroups: number | null;
}

export interface UpdateGroupUseCase {
  groupId: string;
  institutionId: string;
  uid: string;
  contextRole: string;
  data: {
    name?: string;
    description?: string;
    rules?: string;
    coverPhotoId?: string;
  };
}

export interface ChangeProfesorUseCase {
  groupId: string;
  newProfesorId: string;
  institutionId: string;
}

export interface AddStudentToGroupsUseCase {
  userId: string;
  groupIds: string[];
  institutionId: string;
}

export interface AddStudentToGroupUseCase {
  groupId: string;
  userId: string;
}

export interface UpdateStudentsByGroupUseCase {
  groupId: string;
  users: string[];
  institutionId: string;
  uid: string;
  contextRole: string;
}

export interface DeleteStudentByGroupUseCase {
  groupId: string;
  userId: string;
  uid: string;
  contextRole: string;
}
