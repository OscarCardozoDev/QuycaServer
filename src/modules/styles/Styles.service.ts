import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  Style,
  StyleUidResult,
  CreateStyleUseCase,
  UpdateStyleUseCase,
} from './Styles.interface';

/**
 * Catálogo de estilos de la plataforma.
 *
 * `Styles` **no tiene tenant**: salió de `SCOPED_MODELS` el 2026-08-24 junto con
 * sus columnas `groupId` e `institutionId`. Un estilo pertenece a una categoría
 * y a nada más, es el mismo para todas las instituciones, y solo lo escribe
 * `super_admin`.
 *
 * Por eso acá no hay `runWithoutTenant()` en ningún lado: no hay nada de lo que
 * escapar. La extensión de Prisma ya no toca este modelo.
 *
 * Antes cada estilo colgaba de un grupo, así que el catálogo existía repetido
 * una vez por grupo de artes —tres filas "Acuarela"— y las lecturas públicas
 * tenían que colapsarlas por nombre. Ver
 * obsidian/errors/products/2026-08-24-la-galeria-vacia-por-un-undefined.md
 */

const STYLE_SELECT = {
  uid: true,
  name: true,
  description: true,
  categoryId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class StylesService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  /**
   * Todo el catálogo activo, ordenado alfabéticamente.
   *
   * Ya no necesita `distinct: ['name']`: los duplicados no existen más, los
   * borró la migración `20260824190000_styles_catalogo_por_categoria`. El
   * nombre puede repetirse **entre** categorías ("Contemporáneo" en Danzas y en
   * Música), y eso es correcto: son dos estilos distintos.
   */
  async getAll(): Promise<Style[]> {
    return this.prismaService.styles.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: STYLE_SELECT,
    });
  }

  /** Los estilos de una categoría: lo que ofrece el formulario de subida. */
  async getAllByCategory(categoryId: string): Promise<Style[]> {
    return this.prismaService.styles.findMany({
      where: { categoryId, isActive: true },
      orderBy: { name: 'asc' },
      select: STYLE_SELECT,
    });
  }

  async get(uid: string): Promise<Style> {
    const style = await this.prismaService.styles.findUnique({
      where: { uid },
      select: STYLE_SELECT,
    });

    if (!style) throw new NotFoundException(`Style with uid ${uid} not found`);
    return style;
  }

  async create(style: CreateStyleUseCase): Promise<StyleUidResult> {
    const created = await this.prismaService.styles.create({
      data: {
        name: style.name,
        description: style.description,
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
