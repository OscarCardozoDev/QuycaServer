import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { MAX_CONTENIDO_MD } from 'src/common/validation';

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
    example:
      '# Partes de la guitarra\n\n---\n\nLa caja, el mástil y el clavijero.',
    description:
      'Markdown. Va a una columna Text; el SqlInjectionGuard lo excluye del escaneo.',
  })
  @IsString()
  // Columna @db.Text: sin limite en Postgres. Hasta hoy el unico freno era
  // bodyParser (20 MB), y lo que entrara quedaba guardado para siempre.
  @MaxLength(MAX_CONTENIDO_MD)
  contentMd: string;

  @ApiPropertyOptional({ example: 'https://www.youtube.com/watch?v=xxxx' })
  @IsOptional()
  // @IsUrl y no @IsString: este valor se renderiza en un <a href> y React NO
  // escapa el href. `javascript:...` guardado aca se ejecuta al primer clic.
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  videoUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'UIDs de Photos insertadas en el contenido. Sincronizan ChapterPhoto.',
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
    description:
      'Los uids de TODOS los capítulos activos, en el orden deseado.',
  })
  @IsArray()
  @IsString({ each: true })
  uids: string[];
}
