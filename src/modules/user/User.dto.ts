// server/src/modules/user/User.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  NOMBRE_PERSONA,
  NOMBRE_PERSONA_MSG,
  USERNAME,
  USERNAME_MSG,
  TELEFONO,
  TELEFONO_MSG,
  GENEROS,
} from 'src/common/validation';
import { MEDIA_FOLDERS } from 'src/utils/photosManagement';

class PhotoDto {
  @ApiProperty({ example: '/9j/4AAQSkZJRgAB...' })
  @IsString()
  base64: string;

  @ApiProperty({ example: 'foto.jpeg' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'users' })
  // Conjunto cerrado, no texto libre: `folder` es un segmento de ruta en disco.
  // La barrera real esta en resolveFolder() (src/utils/photosManagement.ts);
  // esto es el refuerzo en el borde.
  @IsIn(MEDIA_FOLDERS)
  folder: string;
}

export class CreateStudentDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @Matches(NOMBRE_PERSONA, { message: NOMBRE_PERSONA_MSG })
  name: string;

  @ApiProperty({ example: 'Peña' })
  @IsString()
  @Matches(NOMBRE_PERSONA, { message: NOMBRE_PERSONA_MSG })
  lastName: string;

  @ApiProperty({ example: 'juanpena' })
  @IsString()
  @Matches(USERNAME, { message: USERNAME_MSG })
  username: string;

  @ApiPropertyOptional({ example: 'Estudiante de artes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 'M', enum: GENEROS })
  @IsIn(GENEROS)
  gender: string;

  @ApiProperty({ example: '3001234567' })
  @IsString()
  @Matches(TELEFONO, { message: TELEFONO_MSG })
  telNumber: string;

  @ApiProperty({ example: { career: 'Ingeniería de Sistemas', semester: '5' } })
  @IsObject()
  roleData: Record<string, string>;

  @ApiPropertyOptional({ type: PhotoDto })
  @IsOptional()
  photo?: PhotoDto;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  @Matches(NOMBRE_PERSONA, { message: NOMBRE_PERSONA_MSG })
  name?: string;

  @ApiPropertyOptional({ example: 'Peña' })
  @IsOptional()
  @IsString()
  @Matches(NOMBRE_PERSONA, { message: NOMBRE_PERSONA_MSG })
  lastName?: string;

  @ApiPropertyOptional({ example: 'juanpena' })
  @IsOptional()
  @IsString()
  @Matches(USERNAME, { message: USERNAME_MSG })
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'M', enum: GENEROS })
  @IsOptional()
  @IsIn(GENEROS)
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(TELEFONO, { message: TELEFONO_MSG })
  telNumber?: string;
}

export class UpdateUserPhotoDto {
  @ApiProperty({ example: '/9j/4AAQSkZJRgAB...' })
  @IsString()
  base64: string;

  @ApiProperty({ example: 'foto.jpeg' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'users' })
  // Conjunto cerrado, no texto libre: `folder` es un segmento de ruta en disco.
  // La barrera real esta en resolveFolder() (src/utils/photosManagement.ts);
  // esto es el refuerzo en el borde.
  @IsIn(MEDIA_FOLDERS)
  folder: string;
}
