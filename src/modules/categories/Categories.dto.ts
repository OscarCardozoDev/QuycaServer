import { IsString, IsIn, IsOptional, IsUUID, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Set completo de categorías que la institución oferta. Reemplaza, no suma:
 * lo que no venga acá se borra. El array vacío es válido y significa "no
 * oferta ninguna" — ver CategoriesService.setOfferedCategories.
 */
export class SetOfferedCategoriesDto {
  @ApiProperty({ type: [String], example: ['uuid-artes', 'uuid-musica'] })
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds: string[];
}

export class CreateCategoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() slug: string;
  @ApiProperty() @IsString() iconSlug: string;
}

export class UpdateCategoryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() iconSlug?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateContentRequestDto {
  @ApiProperty({ enum: ['CATEGORY', 'STYLE'] })
  @IsIn(['CATEGORY', 'STYLE']) type: 'CATEGORY' | 'STYLE';
  @ApiProperty() @IsString() requestedName: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() categoryId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() justification?: string;
}

export class ReviewContentRequestDto {
  @ApiProperty() @IsBoolean() approved: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reviewNote?: string;
}
