export interface Style {
  uid: string;
  name: string;
  description: string;
  groupId: string;
  categoryId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StyleUidResult {
  uid: string;
}

// Contrato interno del servicio para crear
export interface CreateStyleUseCase {
  name: string;
  description: string;
  groupId: string;
  categoryId: string;
  institutionId: string;
}

// Contrato interno del servicio para actualizar
export interface UpdateStyleUseCase {
  name?: string;
  description?: string;
  categoryId?: string;
}
