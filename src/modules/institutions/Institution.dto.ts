import { IsString, IsEmail, IsIn, MinLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInstitutionDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() slug: string;
  @ApiProperty({ enum: ['EDUCATIONAL', 'INDEPENDENT'] })
  @IsIn(['EDUCATIONAL', 'INDEPENDENT']) type: 'EDUCATIONAL' | 'INDEPENDENT';
  @ApiProperty() @IsString() representativeName: string;
  @ApiProperty() @IsString() representativeLastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
}

export class UpdateInstitutionDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
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
  @ApiProperty() @IsEmail() toEmail: string;
  @ApiProperty({ enum: ['institutional', 'student'] })
  @IsIn(['institutional', 'student']) targetRole: 'institutional' | 'student';
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
  @IsOptional() @IsString() planSlug?: string | null;
}
