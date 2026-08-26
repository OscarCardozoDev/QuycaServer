export interface Style {
  uid: string;
  name: string;
  description: string;
  categoryId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StyleUidResult {
  uid: string;
}

// Contrato interno del servicio para crear. Sin `groupId` ni `institutionId`:
// el catálogo es de la plataforma y un estilo solo pertenece a una categoría.
export interface CreateStyleUseCase {
  name: string;
  description: string;
  categoryId: string;
}

// Contrato interno del servicio para actualizar
export interface UpdateStyleUseCase {
  name?: string;
  description?: string;
  categoryId?: string;
}
