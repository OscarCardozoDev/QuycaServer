import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import { tenantStorage } from './tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const slug = request.institutionSlug;

    if (!slug) {
      throw new BadRequestException('X-Institution-Slug header is required');
    }

    const institution = await this.prismaService.institution.findUnique({
      where: { slug },
      include: { subscriptionPlan: true },
    });

    if (!institution) {
      throw new NotFoundException(`Institution "${slug}" not found`);
    }

    if (institution.status === 'SUSPENDED') {
      throw new ForbiddenException('Institution is suspended');
    }

    const membership = await this.prismaService.userInstitution.findUnique({
      where: {
        userId_institutionId: {
          userId: request.user.uid,
          institutionId: institution.uid,
        },
      },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException('User is not a member of this institution');
    }

    request.institution = institution as any;
    request.contextRole = membership.contextRole;

    const store = tenantStorage.getStore();
    if (store) store.institutionId = institution.uid;

    return true;
  }
}
