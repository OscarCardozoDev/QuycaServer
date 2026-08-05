/* =========================
 * PARAMS / OPTIONS
 * ========================= */

export interface GroupParams {
  uid: string; // ← solo una declaración
}

export interface GetGroupsOptions {
  page?: number;
  limit?: number;
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
  profesorId: string;
  institutionId: string;
  categoryId: string;
  users?: string[];
}

export interface UpdateGroupUseCase {
  groupId: string;
  data: {
    name?: string;
    profesorId?: string;
  };
}

export interface ChangeProfesorUseCase {
  groupId: string;
  newProfesorId: string;
}

export interface AddStudentToGroupsUseCase {
  userId: string;
  groupIds: string[];
}

export interface AddStudentToGroupUseCase {
  groupId: string;
  userId: string;
}

export interface UpdateStudentsByGroupUseCase {
  groupId: string;
  users: string[];
}

export interface DeleteStudentByGroupUseCase {
  groupId: string;
  userId: string;
}
