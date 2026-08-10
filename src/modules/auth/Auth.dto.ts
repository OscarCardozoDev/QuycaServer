import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';
import { ONBOARDING_STEPS, OnboardingStep } from './onboarding-steps';

/**
 * Respuesta de /auth/login y /auth/register. Las dos devuelven lo mismo porque
 * las dos abren sesión: el frontend monta el wizard con `nextSteps` sin
 * importar por cuál de los dos entró.
 *
 * `isEmailVerified` ya no viaja: quedaba implícito en que `verify-email`
 * aparezca o no en `nextSteps`, y tener las dos cosas invitaba a que se
 * contradijeran.
 */
export class AuthSessionResponseDto {
  @ApiProperty({ example: 'Login successful' })
  message: string;

  @ApiProperty({
    description:
      'Pasos pendientes del alta, en orden. Vacío = va directo al dashboard.',
    enum: ONBOARDING_STEPS,
    isArray: true,
    example: ['verify-email', 'create-profile', 'choose-platform-group'],
  })
  nextSteps: OnboardingStep[];
}

export class LoginDto {
  @ApiProperty({ example: 'artista@gmail.com' })
  @IsEmail()
  mail: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  // Sin restriccion de dominio: Quyca es multi-institucion. Limitar el alta a
  // @usantoto.edu.co dejaba fuera a toda institucion que no sea la USTA y a
  // los artistas independientes, que son la mitad del modelo de registro.
  @ApiProperty({ example: 'artista@gmail.com' })
  @IsEmail()
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
  @ApiProperty({ example: 'artista@gmail.com' })
  @IsEmail()
  mail: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'artista@gmail.com' })
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
