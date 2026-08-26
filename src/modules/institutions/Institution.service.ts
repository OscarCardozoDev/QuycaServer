import {
  Injectable, Inject, NotFoundException, ConflictException, BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from 'src/prisma/prisma.service';
import { hashText } from 'src/utils/crypto.util';
import { randomBytes } from 'crypto';
import {
  CreateInstitutionUseCase, CreateInvitationUseCase, RespondInvitationUseCase,
} from './Institution.interface';
import { toPlanFeatures } from './plan-features';
import { PLATFORM_SLUG } from 'src/modules/groups/Group.service';

/** Plan por defecto de toda institución nueva. El rector lo cambia después. */
const DEFAULT_PLAN_SLUG = 'empirico';

/**
 * Vida de una invitación, en días. Es un tope absoluto, no un valor por
 * defecto: el cliente ya no puede pedir otra duración (ver CreateInvitationDto).
 */
export const INVITATION_EXPIRY_DAYS = 3;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

  async getBySlug(slug: string, requesterUid: string) {
    const institution = await this.prismaService.institution.findUnique({
      where: { slug },
      include: { subscriptionPlan: true },
    });
    if (!institution) throw new NotFoundException('Institution not found');

    const membership = await this.prismaService.userInstitution.findUnique({
      where: { userId_institutionId: { userId: requesterUid, institutionId: institution.uid } }
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException('User is not a member of this institution');
    }

    return institution;
  }

  async update(id: string, data: { name?: string }): Promise<{ uid: string }> {
    const institution = await this.prismaService.institution.findUnique({ where: { uid: id } });
    if (!institution) throw new NotFoundException('Institution not found');
    await this.prismaService.institution.update({ where: { uid: id }, data });
    return { uid: id };
  }

  /**
   * Crea la invitación y le manda el link por correo al invitado.
   *
   * El correo NO es opcional ni decorativo: la invitación existe justamente
   * para alguien que todavía no tiene cuenta y por lo tanto no puede entrar a
   * ver "mis invitaciones". Sin el correo, la única forma de que le llegue el
   * link es que el rector lo copie y lo mande por su cuenta.
   *
   * FALLA BLANDA A PROPÓSITO: si Resend falla, la invitación YA está creada y
   * el token ya es válido. Devolver 500 no la borraría — dejaría al rector
   * creyendo que no pasó nada y reintentando, y cada reintento genera OTRA
   * fila PENDING con otro token para el mismo correo. La invitación seguiría
   * funcionando por el link que igual se devuelve, así que el error 500 no
   * protegería nada y sí ensuciaría la tabla. Por eso se loguea, se sigue, y
   * la respuesta lleva `emailSent` para que la pantalla del rector pueda
   * decir "no se pudo enviar el correo, copiá el link" en lugar de mentir.
   */
  async createInvitation(
    data: CreateInvitationUseCase,
  ): Promise<{ uid: string; token: string; emailSent: boolean }> {
    const token = randomBytes(32).toString('hex');
    // La expiración se calcula acá y solo acá: no depende de nada que mande el
    // cliente. Ver INVITATION_EXPIRY_DAYS.
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * DAY_IN_MS);

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

    const emailSent = await this.sendInvitationEmail({
      institutionId: data.institutionId,
      toEmail: data.toEmail,
      targetRole: data.targetRole,
      token,
      expiresAt,
    });

    return { ...invitation, emailSent };
  }

  /**
   * Manda el correo de invitación. Devuelve si salió o no; nunca lanza — ver
   * el comentario de createInvitation.
   */
  private async sendInvitationEmail(params: {
    institutionId: string;
    toEmail: string;
    targetRole: string;
    token: string;
    expiresAt: Date;
  }): Promise<boolean> {
    try {
      const emailFrom = this.configService.get<string>('config.emailFrom');
      const resendKey = this.configService.get<string>('config.resendKey');
      // Base pública del frontend. NO se hardcodea localhost: el link va a la
      // casilla de una persona que puede abrirlo desde cualquier lado. Ver
      // config.frontendUrl (FRONTEND_URL, con fallback a CORS_URL_FRONT).
      const frontendUrl = this.configService.get<string>('config.frontendUrl');

      if (!emailFrom || !frontendUrl) {
        console.error(
          'No se envió la invitación por correo: falta config.emailFrom o config.frontendUrl',
        );
        return false;
      }

      // Institution y Roles son modelos bootstrap / globales: el where va
      // explícito. El nombre del rol sale de la tabla Roles para no tener una
      // segunda tabla de etiquetas en español que se desincronice; si el rol
      // no está sembrado, se muestra el slug antes que fallar el envío.
      const [institution, role] = await Promise.all([
        this.prismaService.institution.findUnique({
          where: { uid: params.institutionId },
          select: { name: true },
        }),
        this.prismaService.roles.findUnique({
          where: { slug: params.targetRole },
          select: { name: true },
        }),
      ]);

      const institutionName = institution?.name ?? 'una institución en Quyca';
      const roleName = role?.name ?? params.targetRole;
      const link = `${frontendUrl.replace(/\/+$/, '')}/invitation/${params.token}`;
      const vence = params.expiresAt.toLocaleDateString('es-CO', {
        day: '2-digit', month: 'long', year: 'numeric',
      });

      const resend = new Resend(resendKey);
      const { error } = await resend.emails.send({
        from: emailFrom,
        to: params.toEmail,
        subject: `${institutionName} te invitó a Quyca`,
        text: [
          `${institutionName} te invitó a unirte a Quyca como ${roleName}.`,
          '',
          `Para aceptar la invitación, entrá acá: ${link}`,
          '',
          `La invitación vence el ${vence} (${INVITATION_EXPIRY_DAYS} días desde hoy).`,
          'Si todavía no tenés cuenta, el mismo link te deja crearla.',
          '',
          'Si no esperabas esta invitación, ignorá este correo.',
        ].join('\n'),
      });

      if (error) {
        console.error('Error enviando la invitación por correo:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error enviando la invitación por correo:', error);
      return false;
    }
  }

  async getInvitations(institutionId: string) {
    return this.prismaService.institutionInvitation.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Invitaciones vigentes dirigidas al usuario autenticado.
   *
   * El correo se lee de Credentials EN LA BASE, no del JWT: el token solo
   * lleva `uid` y `userTypeId`. Mismo patrón que respondToInvitation().
   *
   * InstitutionInvitation es modelo bootstrap — no pasa por la extensión de
   * Prisma, así que las tres condiciones del where van escritas a mano y son
   * las que definen "vigente": dirigida a mi correo, PENDING, y sin vencer.
   *
   * NO lleva TenantGuard, y es deliberado: una invitación es, por definición,
   * de una institución donde el usuario TODAVÍA NO es miembro. El TenantGuard
   * valida membresía activa contra el X-Institution-Slug, así que montarlo acá
   * devolvería 403 exactamente en el único caso que este endpoint existe para
   * resolver. El aislamiento lo da el filtro por correo, no el tenant.
   */
  async getMyInvitations(userId: string) {
    const credential = await this.prismaService.credentials.findUnique({
      where: { uid: userId },
      select: { mail: true },
    });
    if (!credential) throw new NotFoundException('Credentials not found');

    return this.prismaService.institutionInvitation.findMany({
      where: {
        toEmail: credential.mail,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      select: {
        uid: true,
        token: true,
        // `toEmail` es el correo del propio usuario que consulta, así que no
        // filtra nada de nadie más; `status` es siempre PENDING por el where,
        // pero se devuelve para que la tarjeta comparta forma con la de las
        // invitaciones enviadas y no haya dos contratos parecidos pero
        // distintos.
        toEmail: true,
        status: true,
        targetRole: true,
        expiresAt: true,
        createdAt: true,
        institution: { select: { uid: true, name: true, slug: true } },
      },
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
   *
   * `features` sigue saliendo como array de slugs crudos — es el contrato que
   * usa FeatureGuard y hay frontend que lo compara. Las etiquetas en español
   * van aparte, en `featureLabels`, para que el cliente tenga qué pintar sin
   * que nadie se vea tentado a renombrar un slug para que "se lea mejor".
   */
  async listPlans() {
    const plans = await this.prismaService.subscriptionPlan.findMany({
      where: { isActive: true },
      select: {
        uid: true, name: true, slug: true,
        features: true, maxUsers: true, maxGroups: true, priceUsd: true,
      },
      orderBy: { priceUsd: 'asc' },
    });

    return plans.map((plan) => ({
      ...plan,
      featureLabels: toPlanFeatures(plan.features),
    }));
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

  /**
   * El usuario se va de una institución por decisión propia.
   *
   * No es lo mismo que `deactivateUser`: ahí un rector da de baja a otro, acá
   * cada quien se da de baja a sí mismo. Por eso el endpoint no lleva
   * TenantGuard — se puede salir de una institución que no es la activa — y el
   * `userId` sale del JWT, nunca del body.
   *
   * `UserInstitution` es un modelo bootstrap: no pasa por la extensión de
   * tenant, así que todos los filtros de acá son explícitos y obligatorios.
   *
   * Baja lógica (`isActive: false` + `leftAt`), no borrado: la membresía es la
   * historia de por dónde pasó una persona, y `@@unique([userId,
   * institutionId])` haría que un reingreso chocara con la fila vieja.
   */
  async leaveInstitution(
    userId: string,
    institutionId: string,
  ): Promise<{ uid: string }> {
    const membership = await this.prismaService.userInstitution.findUnique({
      where: { userId_institutionId: { userId, institutionId } },
      include: { institution: { select: { slug: true } } },
    });

    if (!membership || !membership.isActive) {
      throw new NotFoundException('No sos miembro activo de esta institución');
    }

    // quyca-platform es donde vive el artista independiente cuando no
    // pertenece a ninguna otra: salir de ahí deja la cuenta sin ningún lugar
    // donde publicar, y el onboarding la volvería a crear en el próximo login.
    if (membership.institution.slug === PLATFORM_SLUG) {
      throw new ConflictException(
        'No podés salir de Quyca: es tu espacio propio dentro de la plataforma',
      );
    }

    // Una institución sin rector queda huérfana: nadie puede invitar, cambiar
    // el plan ni editar sus datos. El último rector tiene que traspasar el rol
    // antes de irse.
    if (membership.contextRole === 'rector') {
      const otherRectors = await this.prismaService.userInstitution.count({
        where: {
          institutionId,
          contextRole: 'rector',
          isActive: true,
          userId: { not: userId },
        },
      });
      if (otherRectors === 0) {
        throw new ConflictException(
          'Sos el único rector: nombrá a otro antes de salir de la institución',
        );
      }
    }

    await this.prismaService.userInstitution.update({
      where: { userId_institutionId: { userId, institutionId } },
      data: { isActive: false, leftAt: new Date() },
    });

    return { uid: institutionId };
  }
}
