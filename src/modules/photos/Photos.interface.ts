export interface PhotoResponse {
  uid: string;
  name: string;
  url?: string;
}

export interface CreatePhotoUseCase {
  base64: string;
  name: string;
  folder: string;
}

export interface UpdatePhotoUseCase {
  base64: string;
}
