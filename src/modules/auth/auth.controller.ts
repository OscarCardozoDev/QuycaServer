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
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { hashText, verifyText } from 'src/utils/crypto.util';
import { CreateCredentialDto, VerifyCodeDto, ForgotPasswordDto, ResetPasswordDto } from './auth.dto';
import { AuthGuard } from 'src/middleware/jwt.guard';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import { Roles } from 'src/decorators/roles.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private configService: ConfigService,
    private readonly authService: AuthService,
    private jwtService: JwtService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(
    @Body() auth: CreateCredentialDto,
    @Res({ passthrough: true }) res: Response,
  ) {
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

    const token = await this.jwtService.signAsync({
      uid: credential.uid,
      userTypeId: credential.userTypeId,
    });

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24,
    });

    return {
      message: 'Login successful',
      hasProfile: credential.hasProfile,
      hasGroup: credential.hasGroup,
      isEmailVerified: credential.isEmailVerified,
    };
  }

  @Post('register')
  @ApiOperation({ summary: 'Registrar usuario' })
  async register(
    @Body() auth: CreateCredentialDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth.password = await hashText(auth.password);

    const { uid } = await this.authService.setCredentialData(auth);
    const isProduction =
      this.configService.get<string>('config.nodeEnv') === 'production';

    const token = await this.jwtService.signAsync({ uid });

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24,
    });

    return { message: 'User registered successfully', isEmailVerified: false };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Cerrar sesión' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
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
  @Roles('admin')
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
