import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  Style,
  StyleUidResult,
  CreateStyleUseCase,
  UpdateStyleUseCase,
} from './Styles.interface';

@Injectable()
export class StylesService {
  constructor(@Inject(PrismaService) private prismaService: PrismaService) {}

  /* =========================
   * FK GUARD
   * `groupId` is a direct FK on `Styles` supplied by the client. The
   * tenant extension only scopes the top-level call it intercepts, not
   * nested relations resolved by FK — an unchecked foreign groupId would
   * let a `Styles` row (correctly stamped with the caller's own
   * institutionId) point at another tenant's group. `groups.findUnique`
   * is itself scoped, so a foreign id simply comes back null.
   *
   * `categoryId` is NOT checked here: `GroupCategory` is a global,
   * platform-level catalog (no `institutionId` column, not in
   * SCOPED_MODELS, managed only by `super_admin` via CategoriesController)
   * shared by every institution — there is no "wrong tenant" for it.
   * ========================= */
  private async assertGroupInTenant(groupId: string): Promise<void> {
    const group = await this.prismaService.groups.findUnique({
      where: { uid: groupId },
      select: { uid: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
  }

  async getAll(): Promise<Style[]> {
    return this.prismaService.styles.findMany({
      select: {
        uid: true,
        name: true,
        description: true,
        categoryId: true,
        groupId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getAllByGroup(categoryId: string): Promise<Style[]> {
    return this.prismaService.styles.findMany({
      where: { categoryId },
      select: {
        uid: true,
        name: true,
        description: true,
        categoryId: true,
        groupId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async get(uid: string): Promise<Style> {
    const style = await this.prismaService.styles.findUnique({
      where: { uid },
      select: {
        uid: true,
        name: true,
        description: true,
        groupId: true,
        categoryId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!style) throw new NotFoundException(`Style with uid ${uid} not found`);
    return style;
  }

  async create(style: CreateStyleUseCase): Promise<StyleUidResult> {
    await this.assertGroupInTenant(style.groupId);

    const created = await this.prismaService.styles.create({
      data: {
        name: style.name,
        description: style.description,
        groupId: style.groupId,
        categoryId: style.categoryId,
        institutionId: style.institutionId,
      },
      select: { uid: true },
    });

    return { uid: created.uid };
  }

  async update(
    uid: string,
    style: UpdateStyleUseCase,
  ): Promise<StyleUidResult> {
    const data = Object.fromEntries(
      Object.entries(style).filter(([, v]) => v !== undefined),
    );

    const updated = await this.prismaService.styles.update({
      where: { uid },
      data,
      select: { uid: true },
    });

    return { uid: updated.uid };
  }

  async delete(uid: string): Promise<StyleUidResult> {
    await this.get(uid);

    const deleted = await this.prismaService.styles.delete({
      where: { uid },
      select: { uid: true },
    });

    return { uid: deleted.uid };
  }
}
