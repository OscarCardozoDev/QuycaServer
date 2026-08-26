import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateStyleDto {
  @ApiProperty({ example: 'Expresionismo' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Estilo caracterizado por la distorsión emocional' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'uuid-de-la-categoria' })
  @IsString()
  categoryId: string;
}

export class UpdateStyleDto {
  @ApiPropertyOptional({ example: 'Surrealismo' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Nueva descripción' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'uuid-de-la-categoria' })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
