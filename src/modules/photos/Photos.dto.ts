import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

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
  name: string;

  @ApiProperty({ example: 'products' })
  @IsString()
  folder: string;
}

export class UpdatePhotoDto {
  @ApiProperty({ example: '/9j/4AAQSkZJRgAB...' })
  @IsString()
  base64: string;
}
