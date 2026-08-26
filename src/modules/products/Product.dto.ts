import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsEnum,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from './Product.interface';

export class ProductAuthorDto {
  @ApiProperty({ example: 'aa35ee0c-f81a-4739-aa4c-af4cdfa820d3' })
  @IsString()
  userId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isAuthor: boolean;
}

export class ProductImageDto {
  @ApiProperty({ example: '/9j/4AAQSkZJRgAB...' })
  @IsString()
  base64: string;

  @ApiProperty({ example: 'obra.jpeg' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'products' })
  @IsString()
  folder: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;
}

/**
 * Audio de la obra, para la categoria `musica`.
 *
 * No lleva `folder` como ProductImageDto: el audio vive siempre en
 * `public/audio/products` (AUDIO_ROOT), y el nombre del archivo lo genera el
 * servidor con buildAudioFileName(). `name` es solo el nombre original, para
 * mostrarlo en el formulario; el backend lo descarta.
 */
export class ProductAudioDto {
  @ApiProperty({ example: 'data:audio/mpeg;base64,SUQzBAAA...' })
  @IsString()
  base64: string;

  @ApiPropertyOptional({ example: 'cancion.mp3' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class ProductParamsDto {
  @ApiProperty({ example: 'b4fa2024-0da5-49a9-bc29-2417515e118c' })
  @IsString()
  uid: string;
}

export class GetProductsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'a270cbc6-60b1-4853-93e7-2ab2ae2afa4e"' })
  @IsOptional()
  @IsString()
  styleId?: string;

  /** Slug de GroupCategory: `artes`, `teatro`, `danzas`, `musica`, `canto`. */
  @ApiPropertyOptional({ example: 'musica' })
  @IsOptional()
  @IsString()
  categorySlug?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Mi hermosa novia' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Obra hecha en acuarela' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 99999 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiProperty({ example: '2025-07-29' })
  @IsString()
  madeAt: string;

  @ApiProperty({ example: 'b4fa2024-0da5-49a9-bc29-2417515e118c' })
  @IsString()
  groupId: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isSold?: boolean;

  @ApiProperty({ type: [ProductAuthorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAuthorDto)
  authors: ProductAuthorDto[];

  @ApiPropertyOptional({ type: [String], example: ['Expresionismo'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styles?: string[];

  @ApiPropertyOptional({ type: [ProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @ApiPropertyOptional({ type: ProductAudioDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductAudioDto)
  audio?: ProductAudioDto;
}

// ─── Actualizar status de UNA obra (aprobar o negar) ─────────────────────────
// El uid viene del @Param, no del body.
// feedback es requerido solo cuando status === 'REJECTED'.

export class UpdateProductStatusDto {
  @ApiProperty({ enum: ProductStatus, example: ProductStatus.APPROVED })
  @IsEnum(ProductStatus)
  status: ProductStatus;

  @ApiPropertyOptional({ example: 'La resolución de la imagen es muy baja.' })
  @ValidateIf((o) => o.status === ProductStatus.REJECTED)
  @IsString()
  @MaxLength(300)
  feedback: string;
}

// ─── Aprobar VARIAS obras a la vez ───────────────────────────────────────────
// No necesita status: siempre es APPROVED.
// El frontend manda solo los UIDs seleccionados.

export class ApproveManyDto {
  @ApiProperty({
    type: [String],
    example: [
      'aa35ee0c-f81a-4739-aa4c-af4cdfa820d3',
      'b4fa2024-0da5-49a9-bc29-2417515e118c',
    ],
  })
  @IsArray()
  @IsString({ each: true })
  productIds: string[];
}

// ─── DTO para imágenes en el update ──────────────────────────────────────────
export class UpdateProductImageDto {
  @ApiPropertyOptional({ example: 'uuid-foto' })
  @IsOptional()
  @IsString()
  uid?: string;

  @ApiPropertyOptional({ example: '/9j/4AAQSkZJRgAB...' })
  @IsOptional()
  @IsString()
  base64?: string;

  @ApiPropertyOptional({ example: 'foto.jpg' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'products' })
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isMain: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  isExisting: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Nuevo nombre' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Nueva descripción' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: '2025-07-29' })
  @IsOptional()
  @IsString()
  madeAt?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isSold?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styles?: string[];

  @ApiPropertyOptional({ type: [ProductAuthorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAuthorDto)
  authors?: ProductAuthorDto[];

  @ApiPropertyOptional({ type: [UpdateProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductImageDto)
  images?: UpdateProductImageDto[];

  @ApiPropertyOptional({ type: ProductAudioDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductAudioDto)
  audio?: ProductAudioDto;
}
