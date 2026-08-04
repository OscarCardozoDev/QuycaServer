import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'usuario@usantoto.edu.co' })
  @IsEmail()
  mail: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'usuario@usantoto.edu.co' })
  @IsEmail()
  @Matches(/@usantoto\.edu\.co$/, {
    message: 'Solo se permiten correos institucionales (@usantoto.edu.co)',
  })
  mail: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class VerifyCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'El código debe ser numérico de 6 dígitos' })
  code: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'usuario@usantoto.edu.co' })
  @IsEmail()
  mail: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'usuario@usantoto.edu.co' })
  @IsEmail()
  mail: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'El código debe ser numérico de 6 dígitos' })
  code: string;

  @ApiProperty({ example: 'NuevaContraseña@123' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
