import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { hashText } from 'src/utils/crypto.util';
import { randomBytes } from 'crypto';
import {
  CreateInstitutionUseCase, CreateInvitationUseCase, RespondInvitationUseCase,
} from './Institution.interface';

@Injectable()
export class InstitutionService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createInstitution(data: CreateInstitutionUseCase): Promise<{ uid: string }> {
    const plan = await this.prismaService.subscriptionPlan.findUnique({
      where: { slug: data.planSlug },
    });
    if (!plan) throw new NotFoundException(`Plan "${data.planSlug}" not found`);

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
}
