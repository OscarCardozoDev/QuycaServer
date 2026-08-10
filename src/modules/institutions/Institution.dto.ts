import { IsString, IsEmail, IsIn, MinLength, IsOptional, IsInt, Min, Max, IsBoolean } from 'class-validator';
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

export class CreateInvitationDto {
  @ApiProperty() @IsEmail() toEmail: string;
  @ApiProperty({ enum: ['institutional', 'student'] })
  @IsIn(['institutional', 'student']) targetRole: 'institutional' | 'student';
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
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
