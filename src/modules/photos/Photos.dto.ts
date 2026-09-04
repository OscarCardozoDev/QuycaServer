import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, MaxLength } from 'class-validator';
import { MEDIA_FOLDERS } from 'src/utils/photosManagement';

export class PhotoParamsDto {
  @ApiProperty({ example: 'uuid-de-la-foto' })
  @IsString()
  uid: string;
}

export class CreatePhotoDto {
  @ApiProperty({ example: '/9j/4AAQSkZJRgAB...' })
  @IsString()
  base64: string;

  @ApiProperty({ example: 'obra.jpeg' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'products' })
  // Conjunto cerrado, no texto libre: `folder` es un segmento de ruta en disco.
  // La barrera real esta en resolveFolder() (src/utils/photosManagement.ts);
  // esto es el refuerzo en el borde.
  @IsIn(MEDIA_FOLDERS)
  folder: string;
}

export class UpdatePhotoDto {
  @ApiProperty({ example: '/9j/4AAQSkZJRgAB...' })
  @IsString()
  base64: string;
}
