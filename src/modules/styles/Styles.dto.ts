import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateStyleDto {
  @ApiProperty({ example: 'Expresionismo' })
  @IsString()
  @MaxLength(30)
  name: string;

  @ApiProperty({ example: 'Estilo caracterizado por la distorsión emocional' })
  @IsString()
  @MaxLength(300)
  description: string;

  @ApiProperty({ example: 'uuid-de-la-categoria' })
  @IsString()
  categoryId: string;
}

export class UpdateStyleDto {
  @ApiPropertyOptional({ example: 'Surrealismo' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;

  @ApiPropertyOptional({ example: 'Nueva descripción' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ example: 'uuid-de-la-categoria' })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
