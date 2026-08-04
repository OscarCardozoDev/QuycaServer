import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import {
  GetCredentialResult,
  CredentialWithoutProfile,
} from './auth.interface';
import { hashText } from 'src/utils/crypto.util';
import { randomInt } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getCredentialByEmail(
    mail: string,
  ): Promise<GetCredentialResult | null> {
    const credential = await this.prismaService.credentials.findUnique({
      where: { mail },
      select: {
        uid: true,
        password: true,
        isEmailVerified: true,
      },
    });

    if (!credential) return null;

    const userProfile = await this.prismaService.users.findUnique({
      where: { uid: credential.uid },
      select: { userTypeId: true },
    });
    const hasGroup = await this.prismaService.usersGroups.findFirst({
      where: { userId: credential.uid },
    });

    return {
      ...credential,
      hasProfile: Boolean(userProfile),
      hasGroup: Boolean(hasGroup),
      userTypeId: userProfile?.userTypeId ?? null,
    };
  }

  async setCredentialData(auth: RegisterDto): Promise<{ uid: string }> {
    return this.prismaService.credentials.create({
      data: auth,
      select: { uid: true },
    });
  }

  async putPasswordByEmail(auth: { mail: string; password: string }): Promise<void> {
    await this.prismaService.credentials.update({
      where: { mail: auth.mail },
      data: { password: auth.password },
    });
  }

  async sendVerificationCode(uid: string): Promise<void> {
    const credential = await this.prismaService.credentials.findUnique({
      where: { uid },
      select: { mail: true },
    });
    if (!credential) throw new NotFoundException('Credencial no encontrada');

    await this.createAndSendCode({
      credentialUid: uid,
      toEmail: credential.mail,
      subject: 'Código de verificación - Quyca',
      text: `Tu código de verificación es: {CODE}\n\nEste código expira en 10 minutos.`,
    });
  }

  async verifyEmailCode(
    uid: string,
    code: string,
  ): Promise<{ verified: boolean }> {
    const record = await this.prismaService.verificationCodes.findFirst({
      where: {
        credentialUid: uid,
        code,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      throw new BadRequestException('Código inválido o expirado');
    }

    await this.prismaService.verificationCodes.update({
      where: { uid: record.uid },
      data: { usedAt: new Date() },
    });

    await this.prismaService.credentials.update({
      where: { uid },
      data: { isEmailVerified: true },
    });

    return { verified: true };
  }

  async getCredentialsWithoutProfile(): Promise<CredentialWithoutProfile[]> {
    return this.prismaService.$queryRaw<CredentialWithoutProfile[]>`
      SELECT uid::text, mail, "createdAt"
      FROM "Credentials"
      WHERE uid NOT IN (SELECT uid FROM "Users")
      ORDER BY "createdAt" DESC
    `;
  }

  async sendPasswordResetCode(mail: string): Promise<void> {
    const credential = await this.prismaService.credentials.findUnique({
      where: { mail },
      select: { uid: true },
    });
    if (!credential) return; // Do not reveal whether the email exists

    await this.createAndSendCode({
      credentialUid: credential.uid,
      toEmail: mail,
      subject: 'Recuperar contraseña - Quyca',
      text: `Tu código para recuperar la contraseña es: {CODE}\n\nEste código expira en 10 minutos.\n\nSi no solicitaste este cambio, ignora este correo.`,
    });
  }

  async resetPassword(
    mail: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const credential = await this.prismaService.credentials.findUnique({
      where: { mail },
      select: { uid: true },
    });

    if (!credential) {
      throw new BadRequestException('Código inválido o expirado');
    }

    const record = await this.prismaService.verificationCodes.findFirst({
      where: {
        credentialUid: credential.uid,
        code,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      throw new BadRequestException('Código inválido o expirado');
    }

    await this.prismaService.verificationCodes.update({
      where: { uid: record.uid },
      data: { usedAt: new Date() },
    });

    const hashedPassword = await hashText(newPassword);
    await this.putPasswordByEmail({ mail, password: hashedPassword });
  }

  private async createAndSendCode(params: {
    credentialUid: string;
    toEmail: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const resendKey = this.configService.get<string>('config.resendKey');
    const emailFrom = this.configService.get<string>('config.emailFrom');
    const resend = new Resend(resendKey);

    if (!emailFrom) {
      throw new Error('config.emailFrom no está configurado');
    }

    await this.prismaService.verificationCodes.updateMany({
      where: { credentialUid: params.credentialUid, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prismaService.verificationCodes.create({
      data: { credentialUid: params.credentialUid, code, expiresAt },
    });

    const { error } = await resend.emails.send({
      from: emailFrom,
      to: params.toEmail,
      subject: params.subject,
      text: params.text.replace('{CODE}', code),
    });

    if (error) {
      console.error('Error sending email:', error);
      throw new InternalServerErrorException('Error al enviar el correo');
    }
  }
}
