import { IsString, IsEmail, IsIn, MinLength, IsOptional, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInstitutionDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() slug: string;
  @ApiProperty({ enum: ['EDUCATIONAL', 'INDEPENDENT'] })
  @IsIn(['EDUCATIONAL', 'INDEPENDENT']) type: 'EDUCATIONAL' | 'INDEPENDENT';
  @ApiProperty() @IsString() planSlug: string;
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
