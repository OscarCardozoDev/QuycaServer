import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoginDto, RegisterDto } from './Auth.dto';
import {
  GetCredentialResult,
  CredentialWithoutProfile,
} from './Auth.interface';
import { resolveOnboardingSteps, OnboardingStep } from './onboarding-steps';
import { PLATFORM_SLUG } from 'src/modules/groups/Group.service';
import { hashText } from 'src/utils/crypto.util';
import { randomInt } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getCredentialByEmail(
    mail: string,
  ): Promise<GetCredentialResult | null> {
    const credential = await this.prismaService.credentials.findUnique({
      where: { mail },
      select: { uid: true, mail: true, password: true },
    });

    if (!credential) return null;

    const userProfile = await this.prismaService.users.findUnique({
      where: { uid: credential.uid },
      select: { userTypeId: true },
    });

    return {
      uid: credential.uid,
      password: credential.password,
      userTypeId: userProfile?.userTypeId ?? null,
      nextSteps: await this.getOnboardingSteps(credential.uid, credential.mail),
    };
  }

  /**
   * Único lugar donde se arma el `OnboardingState`. Lo usan el login y el
   * registro: cuando cada uno lo resolvía por su cuenta, el alta de artista
   * terminaba con la lista de pasos escrita a mano en el frontend y un
   * profesor invitado que se registraba nunca llegaba a `accept-invitation`.
   *
   * Consulta `isEmailVerified` y `hasProfile` por su cuenta a propósito: son
   * dos lookups por clave primaria, y es el precio de que no exista una
   * segunda copia de estas reglas.
   */
  async getOnboardingSteps(
    uid: string,
    mail: string,
  ): Promise<OnboardingStep[]> {
    const credential = await this.prismaService.credentials.findUnique({
      where: { uid },
      select: { isEmailVerified: true },
    });

    const userProfile = await this.prismaService.users.findUnique({
      where: { uid },
      select: { uid: true },
    });

    // UserInstitution e Institution son modelos bootstrap: no pasan por la
    // extensión de Prisma, así que cada filtro va escrito a mano.
    const memberships = await this.prismaService.userInstitution.findMany({
      where: { userId: uid, isActive: true },
      select: { contextRole: true, institution: { select: { planChosenAt: true } } },
    });

    const rectorMembership = memberships.find((m) => m.contextRole === 'rector');

    const pendingInvitation =
      await this.prismaService.institutionInvitation.findFirst({
        where: {
          toEmail: mail,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        select: { uid: true },
      });

    const platform = await this.prismaService.institution.findUnique({
      where: { slug: PLATFORM_SLUG },
      select: { uid: true },
    });

    // UsersGroups es tabla puente y no lleva institutionId: se acota por la
    // relación al grupo.
    const platformGroup = platform
      ? await this.prismaService.usersGroups.findFirst({
          where: { userId: uid, group: { institutionId: platform.uid } },
          select: { uid: true },
        })
      : null;

    return resolveOnboardingSteps({
      isEmailVerified: Boolean(credential?.isEmailVerified),
      hasProfile: Boolean(userProfile),
      hasPendingInvitation: Boolean(pendingInvitation),
      isRector: Boolean(rectorMembership),
      institutionNeedsPlan: rectorMembership?.institution.planChosenAt == null,
      hasPlatformGroup: Boolean(platformGroup),
    });
  }

  async setCredentialData(auth: RegisterDto): Promise<{ uid: string }> {
    return this.prismaService.credentials.create({
      data: auth,
      select: { uid: true },
    });
  }

  async putPasswordByEmail(auth: { mail: string; password: string }): Promise<void> {
    // passwordChangedAt se escribe en el MISMO update que la contraseña
    // (mismo objeto `data`, misma sentencia UPDATE de Postgres) para que la
    // futura revocación de refresh tokens (tarea 3) tenga un punto de corte
    // atómico. Escribirlo en un update separado reabre el hueco que describe
    // obsidian/Decisiones/Almacenamiento-de-Refresh-Tokens.md.
    await this.prismaService.credentials.update({
      where: { mail: auth.mail },
      data: { password: auth.password, passwordChangedAt: new Date() },
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
