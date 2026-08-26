import { IsString, IsIn, IsOptional, IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
