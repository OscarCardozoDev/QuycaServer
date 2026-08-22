import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async getAllRoles() {
    return this.prismaService.roles.findMany({
      select: { uid: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }
}
