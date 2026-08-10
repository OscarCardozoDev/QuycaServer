import {
  Injectable, Inject, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { hashText } from 'src/utils/crypto.util';
import { randomBytes } from 'crypto';
import {
  CreateInstitutionUseCase, CreateInvitationUseCase, RespondInvitationUseCase,
} from './Institution.interface';

/** Plan por defecto de toda institución nueva. El rector lo cambia después. */
const DEFAULT_PLAN_SLUG = 'empirico';

@Injectable()
export class InstitutionService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createInstitution(data: CreateInstitutionUseCase): Promise<{ uid: string }> {
    // El plan ya no viene del caller: la institución nace en el gratuito y el
    // rector elige después, una vez verificado el correo. Ver el spec de
    // onboarding multi-institución.
    const plan = await this.prismaService.subscriptionPlan.findUnique({
      where: { slug: DEFAULT_PLAN_SLUG },
    });
    if (!plan) {
      throw new NotFoundException(
        `Plan "${DEFAULT_PLAN_SLUG}" not found — run prisma:seed:static`,
      );
    }

    const existing = await this.prismaService.institution.findUnique({
      where: { slug: data.slug },
    });
    if (existing) throw new ConflictException('Institution slug already taken');

    const institutionTypeId = this.configService.get<string>('config.roles.institution');
    const hashedPassword = await hashText(data.password);
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prismaService.$transaction(async (tx) => {
      const institution = await tx.institution.create({
        data: {
          name: data.name,
          slug: data.slug,
          type: data.type,
          status: 'TRIAL',
          subscriptionPlanId: plan.uid,
          trialEndsAt,
          planChosenAt: null,
        },
        select: { uid: true },
      });

      const credential = await tx.credentials.create({
        data: { mail: data.email, password: hashedPassword },
        select: { uid: true },
      });

      await tx.users.create({
        data: {
          uid: credential.uid,
          name: data.representativeName,
          lastName: data.representativeLastName,
          username: data.slug,
          gender: 'N/A',
          telNumber: '0000000000',
          userTypeId: institutionTypeId!,
        },
      });

      await tx.userInstitution.create({
        data: {
          userId: credential.uid,
          institutionId: institution.uid,
          contextRole: 'rector',
        },
      });

      return institution;
    });
  }

  async getBySlug(slug: string) {
    const institution = await this.prismaService.institution.findUnique({
      where: { slug },
      include: { subscriptionPlan: true },
    });
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }

  async update(id: string, data: { name?: string }): Promise<{ uid: string }> {
    const institution = await this.prismaService.institution.findUnique({ where: { uid: id } });
    if (!institution) throw new NotFoundException('Institution not found');
    await this.prismaService.institution.update({ where: { uid: id }, data });
    return { uid: id };
  }

  async createInvitation(data: CreateInvitationUseCase): Promise<{ uid: string; token: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (data.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);

    const invitation = await this.prismaService.institutionInvitation.create({
      data: {
        institutionId: data.institutionId,
        toEmail: data.toEmail,
        targetRole: data.targetRole,
        token,
        expiresAt,
      },
      select: { uid: true, token: true },
    });

    return invitation;
  }

  async getInvitations(institutionId: string) {
    return this.prismaService.institutionInvitation.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvitationByToken(token: string) {
    const invitation = await this.prismaService.institutionInvitation.findUnique({
      where: { token },
      include: { institution: { select: { uid: true, name: true, slug: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }

  async respondToInvitation(data: RespondInvitationUseCase): Promise<{ status: string }> {
    const invitation = await this.prismaService.institutionInvitation.findUnique({
      where: { token: data.token },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Invitation already responded');
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    const credential = await this.prismaService.credentials.findUnique({
      where: { uid: data.userId },
      select: { mail: true },
    });
    if (!credential || invitation.toEmail !== credential.mail) {
      throw new BadRequestException('This invitation was not sent to your email');
    }

    if (!data.accept) {
      await this.prismaService.institutionInvitation.update({
        where: { token: data.token },
        data: { status: 'REJECTED', respondedAt: new Date(), toUserId: data.userId },
      });
      return { status: 'REJECTED' };
    }

    const alreadyMember = await this.prismaService.userInstitution.findUnique({
      where: {
        userId_institutionId: { userId: data.userId, institutionId: invitation.institutionId },
      },
    });

    if (!alreadyMember) {
      await this.prismaService.userInstitution.create({
        data: {
          userId: data.userId,
          institutionId: invitation.institutionId,
          contextRole: invitation.targetRole,
        },
      });
    }

    await this.prismaService.institutionInvitation.update({
      where: { token: data.token },
      data: { status: 'ACCEPTED', respondedAt: new Date(), toUserId: data.userId },
    });

    return { status: 'ACCEPTED' };
  }

  /**
   * Planes disponibles para el alta y el cambio de plan.
   *
   * SubscriptionPlan NO está en SCOPED_MODELS, así que la extensión de Prisma
   * ni lo mira: este método es público y NO necesita runWithoutTenant().
   * Agregárselo "por las dudas" sugeriría una protección que no existe.
   *
   * stripePriceId queda fuera del select a propósito: es un identificador de
   * facturación, no información de producto.
   */
  async listPlans() {
    return this.prismaService.subscriptionPlan.findMany({
      where: { isActive: true },
      select: {
        uid: true, name: true, slug: true,
        features: true, maxUsers: true, maxGroups: true, priceUsd: true,
      },
      orderBy: { priceUsd: 'asc' },
    });
  }

  /**
   * Cambia el plan de la institución, o solo sella la decisión si planSlug es
   * null ("seguir con el gratuito").
   *
   * Institution es modelo bootstrap: no pasa por la extensión, el where va
   * explícito. El institutionId lo resuelve el TenantGuard desde el header.
   *
   * Hoy asigna el plan directamente, sin cobrar. Cuando exista pasarela, este
   * método pasa a abrir un checkout y el plan cambia recién con el webhook.
   * Ver obsidian/Tareas/Ideas Futuras.md § Pasarela de pago.
   */
  async changePlan(
    institutionId: string,
    planSlug: string | null,
  ): Promise<{ uid: string }> {
    if (!planSlug) {
      await this.prismaService.institution.update({
        where: { uid: institutionId },
        data: { planChosenAt: new Date() },
      });
      return { uid: institutionId };
    }

    const plan = await this.prismaService.subscriptionPlan.findUnique({
      where: { slug: planSlug },
    });
    if (!plan) throw new NotFoundException(`Plan "${planSlug}" not found`);

    await this.prismaService.institution.update({
      where: { uid: institutionId },
      data: { subscriptionPlanId: plan.uid, planChosenAt: new Date() },
    });

    return { uid: institutionId };
  }
}
