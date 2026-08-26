import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

/* =========================
 * PARAMS / OPTIONS
 * ========================= */

export enum ProductStatus {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PENDING = 'PENDING',
}

export class GetProductsOptions {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  limit?: number = 10;

  @IsOptional()
  styleId?: string;

  /** Slug de GroupCategory: `artes`, `teatro`, `danzas`, `musica`, `canto`. */
  @IsOptional()
  categorySlug?: string;
}

/* =========================
 * CASOS DE USO
 * ========================= */

export interface CreateProductUseCase {
  product: {
    name: string;
    description: string;
    price?: number;
    madeAt: Date;
    isSold?: boolean;
    groupId: string;
  };
  authors: {
    userId: string;
    isAuthor: boolean;
  }[];
  styles?: string[];
  images?: {
    base64: string;
    name: string;
    folder: string;
    isMain?: boolean;
  }[];
  /** Audio de la obra (categoria `musica`). El data-URL lo valida audioDecoder. */
  audio?: { base64: string };
  institutionId: string;
}

export interface UpdateProductImageUseCase {
  uid?: string;
  base64?: string;
  name?: string;
  folder?: string;
  isMain: boolean;
  isExisting: boolean;
}

export interface UpdateProductUseCase {
  productId: string;
  /** Quién edita: la obra tiene que ser suya. Ver `updateProductUseCase`. */
  userId: string;
  data: {
    name?: string;
    description?: string;
    price?: number;
    madeAt?: Date;
    isSold?: boolean;
  };
  authors?: {
    userId: string;
    isAuthor: boolean;
  }[];
  styles?: string[];
  images?: UpdateProductImageUseCase[];
  /** Audio nuevo. Si no viene, el que ya estaba se conserva. */
  audio?: { base64: string };
}

export interface UpdateStatusUseCase {
  uid: string;
  status: ProductStatus;
  feedback?: string;
}
