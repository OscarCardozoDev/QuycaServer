import {
  IsString,
  IsEmail,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import {
  NOMBRE_PERSONA,
  NOMBRE_PERSONA_MSG,
  SLUG,
  SLUG_MSG,
  MAX_EMAIL,
  MAX_PASSWORD,
} from 'src/common/validation';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInstitutionDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;

  /**
   * El campo mas delicado del proyecto: viaja en el header
   * `X-Institution-Slug` y es lo que el TenantGuard usa para resolver el
   * tenant. Hasta hoy aceptaba cualquier string.
   */
  @ApiProperty({ example: 'usta-tunja' })
  @IsString()
  @Matches(SLUG, { message: SLUG_MSG })
  slug: string;

  @ApiProperty({ enum: ['EDUCATIONAL', 'INDEPENDENT'] })
  @IsIn(['EDUCATIONAL', 'INDEPENDENT'])
  type: 'EDUCATIONAL' | 'INDEPENDENT';

  @ApiProperty({ example: 'Maria' })
  @IsString()
  @Matches(NOMBRE_PERSONA, { message: NOMBRE_PERSONA_MSG })
  representativeName: string;

  @ApiProperty({ example: 'Peña' })
  @IsString()
  @Matches(NOMBRE_PERSONA, { message: NOMBRE_PERSONA_MSG })
  representativeLastName: string;

  @ApiProperty() @IsEmail() @MaxLength(MAX_EMAIL) email: string;
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(MAX_PASSWORD)
  password: string;
}

export class UpdateInstitutionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

/**
 * La duración de la invitación NO es un campo del DTO a propósito.
 *
 * Antes venía como `expiresInDays` (1 a 30 días) y el cliente la elegía. Un
 * token que abre la puerta de una institución no puede tener una vida que
 * decida quien envía el request: el tope son 3 días y lo fija el service con
 * INVITATION_EXPIRY_DAYS. Si volvés a agregar el campo acá, el tope deja de
 * existir — el ValidationPipe corre con forbidNonWhitelisted, así que hoy
 * mandarlo devuelve 400 en lugar de ignorarse en silencio.
 */
export class CreateInvitationDto {
  @ApiProperty() @IsEmail() @MaxLength(MAX_EMAIL) toEmail: string;
  @ApiProperty({ enum: ['institutional', 'student'] })
  @IsIn(['institutional', 'student'])
  targetRole: 'institutional' | 'student';
}

export class RespondInvitationDto {
  @ApiProperty() @IsBoolean() accept: boolean;
}

export class ChangePlanDto {
  /**
   * `null` = "seguir con el gratuito": no cambia de plan, solo registra que
   * el rector ya decidió, para que el onboarding no vuelva a preguntar.
   */
  @ApiProperty({ required: false, nullable: true, example: 'academia' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  planSlug?: string | null;
}
