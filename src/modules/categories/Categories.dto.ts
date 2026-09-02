import {
  IsString,
  IsIn,
  IsOptional,
  IsUUID,
  IsBoolean,
  Matches,
  MaxLength,
} from 'class-validator';
import { SLUG, SLUG_MSG, MAX_TEXTO_LARGO } from 'src/common/validation';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty() @IsString() @MaxLength(50) name: string;

  @ApiProperty({ example: 'artes' })
  @IsString()
  @Matches(SLUG, { message: SLUG_MSG })
  slug: string;

  @ApiProperty({ example: 'palette' })
  @IsString()
  @Matches(SLUG, { message: SLUG_MSG })
  iconSlug: string;
}

export class UpdateCategoryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(SLUG, { message: SLUG_MSG })
  iconSlug?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateContentRequestDto {
  @ApiProperty({ enum: ['CATEGORY', 'STYLE'] })
  @IsIn(['CATEGORY', 'STYLE'])
  type: 'CATEGORY' | 'STYLE';
  @ApiProperty() @IsString() @MaxLength(100) requestedName: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() categoryId?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXTO_LARGO)
  justification?: string;
}

export class ReviewContentRequestDto {
  @ApiProperty() @IsBoolean() approved: boolean;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXTO_LARGO)
  reviewNote?: string;
}
