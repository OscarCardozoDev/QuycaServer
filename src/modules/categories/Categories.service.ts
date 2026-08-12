import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateCategoryUseCase,
  CreateContentRequestUseCase,
  ReviewContentRequestUseCase,
} from './Categories.interface';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  async getActiveCategories() {
    return this.prismaService.groupCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Las categorías que oferta la institución activa.
   *
   * InstitutionCategory NO está en SCOPED_MODELS (ver tenant.extension.ts):
   * el `where` por institutionId es la única cosa que impide devolver la
   * oferta de todas las instituciones. No lo saques.
   *
   * Devuelve la categoría entera, no solo el id, porque la pantalla del rector
   * necesita name/slug/iconSlug para marcar cuáles están seleccionadas contra
   * la lista global de GET /categories.
   */
  async getOfferedCategories(institutionId: string) {
    const rows = await this.prismaService.institutionCategory.findMany({
      where: { institutionId },
      select: {
        category: {
          select: {
            uid: true,
            name: true,
            slug: true,
            iconSlug: true,
            isActive: true,
          },
        },
      },
    });

    return rows
      .map((row) => row.category)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Reemplaza la oferta de la institución por `categoryIds`.
   *
   * Es un reemplazo, no un merge: la pantalla del rector manda el set completo
   * de casillas marcadas, y desmarcar una tiene que borrarla. Una lista vacía
   * es válida y significa "no oferta ninguna" — a partir de ahí no puede crear
   * grupos hasta volver a marcar algo (ver GroupService.createGroupUseCase).
   *
   * Valida que los ids existan y estén activos antes de tocar nada: sin esto,
   * un id inventado entraría como fila huérfana y la pantalla mostraría una
   * categoría que el catálogo global no tiene.
   */
  async setOfferedCategories(institutionId: string, categoryIds: string[]) {
    const unique = [...new Set(categoryIds)];

    if (unique.length) {
      const found = await this.prismaService.groupCategory.findMany({
        where: { uid: { in: unique }, isActive: true },
        select: { uid: true },
      });
      const foundIds = new Set(found.map((c) => c.uid));
      const invalid = unique.filter((id) => !foundIds.has(id));
      if (invalid.length) {
        throw new BadRequestException(
          `Categoría inexistente o inactiva: ${invalid.join(', ')}`,
        );
      }
    }

    await this.prismaService.$transaction(async (tx) => {
      // El `where` se arma según haya o no ids: `notIn: []` depende de que
      // Prisma lo traduzca a una condición siempre verdadera, y de eso no vale
      // la pena depender cuando la diferencia es borrar toda la oferta o no
      // borrar nada.
      await tx.institutionCategory.deleteMany({
        where: unique.length
          ? { institutionId, categoryId: { notIn: unique } }
          : { institutionId },
      });

      if (unique.length) {
        await tx.institutionCategory.createMany({
          data: unique.map((categoryId) => ({ institutionId, categoryId })),
          skipDuplicates: true,
        });
      }
    });

    return this.getOfferedCategories(institutionId);
  }

  async createCategory(data: CreateCategoryUseCase) {
    const existing = await this.prismaService.groupCategory.findUnique({
      where: { slug: data.slug },
    });
    if (existing)
      throw new ConflictException(
        `Category slug "${data.slug}" already exists`,
      );

    return this.prismaService.groupCategory.create({
      data,
      select: { uid: true },
    });
  }

  async updateCategory(
    id: string,
    data: { name?: string; iconSlug?: string; isActive?: boolean },
  ) {
    const cat = await this.prismaService.groupCategory.findUnique({
      where: { uid: id },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prismaService.groupCategory.update({
      where: { uid: id },
      data,
    });
  }

  async createContentRequest(data: CreateContentRequestUseCase) {
    if (data.type === 'STYLE' && !data.categoryId) {
      throw new BadRequestException(
        'categoryId is required for STYLE requests',
      );
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

  async getInstitutionContentRequests() {
    return this.prismaService.contentRequest.findMany({
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
      const existing = await this.prismaService.groupCategory.findUnique({
        where: { slug },
      });
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
