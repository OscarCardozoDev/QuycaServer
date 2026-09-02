import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { MAX_REGLAS } from 'src/common/validation';
import { Transform } from 'class-transformer';

export class GroupParamsDto {
  @ApiProperty({ example: 'uuid-del-grupo' })
  @IsString()
  uid: string;
}

export class GetGroupsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  limit?: number = 10;
}

export class CreateGroupDto {
  @ApiProperty({ example: 'Grupo A 2025' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'uuid-del-profesor' })
  @IsOptional()
  @IsString()
  profesorId?: string;

  @ApiProperty({ example: 'uuid-de-categoria' })
  @IsString()
  categoryId: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['uuid-alumno-1', 'uuid-alumno-2'],
    description: 'IDs de los alumnos a agregar al grupo (opcional)',
  })
  @IsOptional()
  @IsArray()
  users?: string[];

  @ApiPropertyOptional({ example: 'Colectivo de fotografía analógica' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'Traer materiales propios. Asistencia mínima del 80%.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REGLAS)
  rules?: string;

  @ApiPropertyOptional({ example: 'uuid-de-la-foto' })
  @IsOptional()
  @IsString()
  coverPhotoId?: string;
}

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Artes y Fotografía' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Colectivo de fotografía analógica' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'Traer materiales propios.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REGLAS)
  rules?: string;

  @ApiPropertyOptional({ example: 'uuid-de-la-foto' })
  @IsOptional()
  @IsString()
  coverPhotoId?: string;
}

export class AddStudentDto {
  @ApiPropertyOptional({ example: 'uuid-del-usuario' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ type: [String], example: ['uuid-grupo-1', 'uuid-grupo-2'] })
  @IsArray()
  groupIds: string[];
}

export class DeleteStudentDto {
  @ApiProperty({ example: 'uuid-del-usuario' })
  @IsString()
  userId: string;
}

export class UpdateStudentsDto {
  @ApiProperty({ type: [String], example: ['uuid-alumno-1', 'uuid-alumno-2'] })
  @IsArray()
  users: string[];
}

export class ChangeProfesorDto {
  @ApiProperty({ example: 'uuid-del-nuevo-profesor' })
  @IsString()
  newProfesorId: string;
}
