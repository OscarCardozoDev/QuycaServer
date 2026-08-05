import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateCategoryUseCase, CreateContentRequestUseCase, ReviewContentRequestUseCase,
} from './Categories.interface';

@Injectable()
export class CategoriesService {
  constructor(private readonly prismaService: PrismaService) {}

  async getActiveCategories() {
    return this.prismaService.groupCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(data: CreateCategoryUseCase) {
    const existing = await this.prismaService.groupCategory.findUnique({
      where: { slug: data.slug },
    });
    if (existing) throw new ConflictException(`Category slug "${data.slug}" already exists`);

    return this.prismaService.groupCategory.create({
      data,
      select: { uid: true },
    });
  }

  async updateCategory(id: string, data: { name?: string; iconSlug?: string; isActive?: boolean }) {
    const cat = await this.prismaService.groupCategory.findUnique({ where: { uid: id } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prismaService.groupCategory.update({ where: { uid: id }, data });
  }

  async createContentRequest(data: CreateContentRequestUseCase) {
    if (data.type === 'STYLE' && !data.categoryId) {
      throw new BadRequestException('categoryId is required for STYLE requests');
    }
    return this.prismaService.contentRequest.create({
      data: {
        institutionId: data.institutionId,
        type: data.type,
        requestedName: data.requestedName,
        categoryId: data.categoryId ?? null,
        justification: data.justification ?? null,
        status: 'PENDING',
      },
      select: { uid: true },
    });
  }

  async getAllContentRequests() {
    return this.prismaService.contentRequest.findMany({
      include: { institution: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInstitutionContentRequests(institutionId: string) {
    return this.prismaService.contentRequest.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewContentRequest(data: ReviewContentRequestUseCase) {
    const request = await this.prismaService.contentRequest.findUnique({
      where: { uid: data.requestId },
    });
    if (!request) throw new NotFoundException('Content request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Content request already reviewed');
    }

    if (data.approved && request.type === 'CATEGORY') {
      const slug = request.requestedName.toLowerCase().replace(/\s+/g, '-');
      const existing = await this.prismaService.groupCategory.findUnique({ where: { slug } });
      if (!existing) {
        await this.prismaService.groupCategory.create({
          data: { name: request.requestedName, slug, iconSlug: 'default' },
        });
      }
    }

    await this.prismaService.contentRequest.update({
      where: { uid: data.requestId },
      data: {
        status: data.approved ? 'APPROVED' : 'REJECTED',
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        reviewNote: data.reviewNote ?? null,
      },
    });

    return { status: 'REVIEWED' };
  }
}
