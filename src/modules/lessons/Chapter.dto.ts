import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class ChapterParamsDto {
  @ApiProperty({ example: 'uuid-de-la-leccion' })
  @IsString()
  lessonId: string;

  @ApiProperty({ example: 'uuid-del-capitulo' })
  @IsString()
  uid: string;
}

export class CreateChapterDto {
  @ApiProperty({ example: 'Partes de la guitarra' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({
    example: '# Partes de la guitarra\n\n---\n\nLa caja, el mástil y el clavijero.',
    description: 'Markdown. Va a una columna Text; el SqlInjectionGuard lo excluye del escaneo.',
  })
  @IsString()
  contentMd: string;

  @ApiPropertyOptional({ example: 'https://www.youtube.com/watch?v=xxxx' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  videoUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'UIDs de Photos insertadas en el contenido. Sincronizan ChapterPhoto.',
  })
  @IsOptional()
  @IsArray()
  photoIds?: string[];
}

export class UpdateChapterDto extends CreateChapterDto {}

export class ReorderChaptersDto {
  @ApiProperty({
    type: [String],
    example: ['uuid-cap-3', 'uuid-cap-1', 'uuid-cap-2'],
    description: 'Los uids de TODOS los capítulos activos, en el orden deseado.',
  })
  @IsArray()
  @IsString({ each: true })
  uids: string[];
}
