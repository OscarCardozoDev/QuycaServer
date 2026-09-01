import {
  Controller,
  Post,
  Body,
  Res,
  UnauthorizedException,
  UseGuards,
  Req,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './Auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { hashText, verifyText } from 'src/utils/crypto.util';
import {
  LoginDto,
  RegisterDto,
  VerifyCodeDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AuthSessionResponseDto,
} from './Auth.dto';
import { AuthGuard } from 'src/guards/jwt.guard';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import { Roles } from 'src/decorators/roles.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private configService: ConfigService,
    private readonly authService: AuthService,
    private jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  // ── private helpers ───────────────────────────────────────────────────────
  private accessCookieOptions(isProduction: boolean) {
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
      maxAge: 1000 * 60 * 15, // 15 min, igual que el access token
    };
  }

  // El path distinto por entorno es lo que rompe en producción sin avisar:
  // `nginx.conf` hace `proxy_pass http://backend:3000/` sobre `location
  // /api/`, así que recorta el prefijo `/api` antes de que llegue al backend.
  // El navegador, en cambio, evalúa el path de la cookie contra la URL que
  // ÉL pidió (`/api/auth/refresh`), no contra la que ve Nest (`/auth/refresh`).
  // Si dejáramos `/auth` fijo, en producción la cookie de refresh jamás
  // matchearía y todos quedarían deslogueados cada 15 minutos.
  private refreshCookieOptions(isProduction: boolean) {
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
      path: isProduction ? '/api/auth' : '/auth',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    };
  }

  private setSessionCookies(
    res: Response,
    isProduction: boolean,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    res.cookie(
      'access_token',
      tokens.accessToken,
      this.accessCookieOptions(isProduction),
    );
    res.cookie(
      'refresh_token',
      tokens.refreshToken,
      this.refreshCookieOptions(isProduction),
    );
  }

  private clearSessionCookies(res: Response, isProduction: boolean) {
    res.clearCookie('access_token', this.accessCookieOptions(isProduction));
    res.clearCookie('refresh_token', this.refreshCookieOptions(isProduction));
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 201, type: AuthSessionResponseDto })
  async login(
    @Body() auth: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponseDto> {
    const credential = await this.authService.getCredentialByEmail(auth.mail);
    const isProduction =
      this.configService.get<string>('config.nodeEnv') === 'production';

    if (!credential) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isValid = await verifyText(auth.password, credential.password);
    if (!isValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tokens = await this.refreshTokenService.issuePair(
      credential.uid,
      credential.userTypeId ?? null,
    );

    this.setSessionCookies(res, isProduction, tokens);

    return {
      message: 'Login successful',
      nextSteps: credential.nextSteps,
    };
  }

  @Post('register')
  @ApiOperation({ summary: 'Registrar usuario' })
  @ApiResponse({ status: 201, type: AuthSessionResponseDto })
  async register(
    @Body() auth: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponseDto> {
    const mail = auth.mail;
    auth.password = await hashText(auth.password);

    const { uid } = await this.authService.setCredentialData(auth);
    const isProduction =
      this.configService.get<string>('config.nodeEnv') === 'production';

    // Todavía no hay perfil en este punto del registro, así que no hay
    // userTypeId que firmar: null (soportado por issuePair/RefreshPayload).
    const tokens = await this.refreshTokenService.issuePair(uid, null);

    this.setSessionCookies(res, isProduction, tokens);

    // Los pasos los resuelve el backend igual que en el login. Antes el
    // registro solo devolvía `isEmailVerified: false` y el frontend inventaba
    // la lista, con lo cual un profesor invitado que se registraba se saltaba
    // `accept-invitation`.
    return {
      message: 'User registered successfully',
      nextSteps: await this.authService.getOnboardingSteps(uid, mail),
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotar el par access/refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens rotados, cookies nuevas' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token ausente, inválido, reusado o revocado',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const isProduction =
      this.configService.get<string>('config.nodeEnv') === 'production';
    const rawToken = (req.cookies as Record<string, string> | undefined)?.[
      'refresh_token'
    ];

    if (!rawToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    try {
      const tokens = await this.refreshTokenService.rotate(rawToken);
      this.setSessionCookies(res, isProduction, tokens);
      return { message: 'Token refrescado' };
    } catch (error) {
      this.clearSessionCookies(res, isProduction);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const isProduction =
      this.configService.get<string>('config.nodeEnv') === 'production';
    const rawToken = (req.cookies as Record<string, string> | undefined)?.[
      'refresh_token'
    ];

    // Mata la familia entera en el servidor, no solo la cookie del
    // navegador: ese era el bug original que motivó toda la fase.
    // revokeByToken() nunca lanza, así que logout siempre limpia y
    // devuelve 200, con cookie o sin ella, válida o no.
    if (rawToken) {
      await this.refreshTokenService.revokeByToken(rawToken);
    }

    this.clearSessionCookies(res, isProduction);
    return { message: 'Logged out' };
  }

  @Post('send-code')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Enviar código de verificación por correo' })
  async sendCode(@Req() req: AuthenticatedRequest) {
    await this.authService.sendVerificationCode(req.user.uid);
    return { message: 'Código enviado' };
  }

  @Post('verify-code')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Verificar código de correo' })
  async verifyCode(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VerifyCodeDto,
  ) {
    await this.authService.verifyEmailCode(req.user.uid, dto.code);
    return { message: 'Código verificado' };
  }

  @Get('without-profile')
  @ApiOperation({
    summary: 'Obtener credenciales sin perfil de usuario (admin)',
  })
  @UseGuards(AuthGuard)
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  async getWithoutProfile() {
    return this.authService.getCredentialsWithoutProfile();
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Solicitar código de recuperación de contraseña' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.sendPasswordResetCode(dto.mail);
    return { message: 'Código enviado' };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Resetear contraseña con código de verificación' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.mail, dto.code, dto.newPassword);
    return { message: 'Contraseña actualizada' };
  }
}
