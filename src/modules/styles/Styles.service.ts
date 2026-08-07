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
    const created = await this.prismaService.styles.create({
      data: {
        name: style.name,
        description: style.description,
        groupId: style.groupId,
        categoryId: style.categoryId,
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
