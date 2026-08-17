import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength, IsIn } from 'class-validator';

export class LessonParamsDto {
  @ApiProperty({ example: 'uuid-de-la-leccion' })
  @IsString()
  uid: string;
}

export class CreateLessonDto {
  @ApiProperty({ example: 'Básico Guitarra 1' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ example: 'Cinco capítulos para arrancar de cero.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({
    example: 'uuid-del-grupo',
    description: 'Grupo de origen. Si viene, la categoría se hereda de él.',
  })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({
    example: 'uuid-de-categoria',
    description: 'Obligatorio solo si no se manda groupId.',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class UpdateLessonDto {
  @ApiPropertyOptional({ example: 'Básico Guitarra 1 (revisado)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({ description: 'Solo se acepta mientras la lección es DRAFT.' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'uuid-de-la-foto' })
  @IsOptional()
  @IsString()
  coverPhotoId?: string;
}

export class ListLessonsDto {
  @ApiPropertyOptional({ example: 'artes', description: 'Slug de la categoría.' })
  @IsOptional()
  @IsString()
  category?: string;
}

export class InstitutionQueueDto {
  @ApiPropertyOptional({ enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'])
  status?: string;
}

export class ReviewLessonDto {
  @ApiProperty({ example: true, description: 'true aprueba, false rechaza.' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ example: 'Faltan ejemplos en el capítulo 3.' })
  @IsOptional()
  @IsString()
  feedback?: string;
}
