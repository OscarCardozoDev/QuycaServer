import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LessonService } from './Lesson.service';
import type { CreateChapterDto, UpdateChapterDto } from './Chapter.dto';

/**
 * Escritura de capítulos. NO tiene ningún `runWithoutTenant`: editar un
 * capítulo es siempre dentro del propio tenant. Las LECTURAS, que sí pueden
 * ser cross-tenant, viven en LessonService, que es el único archivo del
 * módulo que apaga el filtro.
 */
@Injectable()
export class ChapterService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly lessonService: LessonService,
  ) {}

  async create(
    lessonId: string,
    dto: CreateChapterDto,
    userId: string,
    contextRole: string,
  ) {
    await this.lessonService.assertCanEditLesson(lessonId, userId, contextRole);

    const { _max } = await this.prisma.chapters.aggregate({
      where: { lessonId, isActive: true },
      _max: { sequence: true },
    });

    // `institutionId` no se declara acá: la extensión de Prisma la inyecta
    // en la escritura real y la pisa si estuviera. El cast es solo para que
    // TypeScript acepte el literal sin ese campo obligatorio en el tipo
    // generado; en runtime el shape es exactamente este. Mismo criterio que
    // createLesson en Lesson.service.ts.
    const chapter = await this.prisma.chapters.create({
      data: {
        lessonId,
        sequence: (_max.sequence ?? 0) + 1,
        title: dto.title,
        contentMd: dto.contentMd,
        videoUrl: dto.videoUrl,
      } as Parameters<typeof this.prisma.chapters.create>[0]['data'],
    });

    await this.syncPhotos(chapter.uid, dto.photoIds);
    return chapter;
  }

  async update(
    lessonId: string,
    chapterId: string,
    dto: UpdateChapterDto,
    userId: string,
    contextRole: string,
  ) {
    await this.lessonService.assertCanEditLesson(lessonId, userId, contextRole);

    const owned = await this.prisma.chapters.findFirst({
      where: { uid: chapterId, lessonId, isActive: true },
      select: { uid: true },
    });
    if (!owned) throw new NotFoundException('El capítulo no existe en esta lección');

    const chapter = await this.prisma.chapters.update({
      where: { uid: chapterId },
      data: {
        title: dto.title,
        contentMd: dto.contentMd,
        videoUrl: dto.videoUrl ?? null,
      },
    });

    await this.syncPhotos(chapterId, dto.photoIds);
    return chapter;
  }

  /** Desactivar y recompactar: la secuencia queda 1..N sin huecos. */
  async deactivate(
    lessonId: string,
    chapterId: string,
    userId: string,
    contextRole: string,
  ) {
    await this.lessonService.assertCanEditLesson(lessonId, userId, contextRole);

    const owned = await this.prisma.chapters.findFirst({
      where: { uid: chapterId, lessonId, isActive: true },
      select: { uid: true },
    });
    if (!owned) throw new NotFoundException('El capítulo no existe en esta lección');

    await this.prisma.chapters.update({
      where: { uid: chapterId },
      data: { isActive: false },
    });

    const remaining = await this.prisma.chapters.findMany({
      where: { lessonId, isActive: true },
      orderBy: { sequence: 'asc' },
      select: { uid: true },
    });

    await this.prisma.$transaction(
      remaining.map((c, i) =>
        this.prisma.chapters.update({
          where: { uid: c.uid },
          data: { sequence: i + 1 },
        }),
      ),
    );
  }

  /**
   * Reescribe 1..N en una transacción.
   *
   * Funciona porque `sequence` NO lleva @@unique: con una restricción no
   * diferible, Postgres validaría fila por fila y los estados intermedios
   * chocarían. La contigüidad la hace cumplir este método.
   */
  async reorder(
    lessonId: string,
    uids: string[],
    userId: string,
    contextRole: string,
  ) {
    await this.lessonService.assertCanEditLesson(lessonId, userId, contextRole);

    const existing = await this.prisma.chapters.findMany({
      where: { lessonId, isActive: true },
      select: { uid: true },
    });
    const known = new Set(existing.map((c) => c.uid));

    if (uids.length !== known.size || uids.some((u) => !known.has(u))) {
      throw new BadRequestException(
        'La lista tiene que traer todos los capítulos activos de la lección, y solo esos',
      );
    }

    await this.prisma.$transaction(
      uids.map((uid, i) =>
        this.prisma.chapters.update({
          where: { uid },
          data: { sequence: i + 1 },
        }),
      ),
    );
  }

  /**
   * Marcar un capítulo como terminado. Idempotente: volver a marcarlo no
   * duplica ni falla, por el @@unique([userId, chapterId]).
   *
   * Pasa por readChapter (que a su vez pasa por getReadableLesson) y no por
   * assertCanEditLesson: el que estudia no es el que edita.
   */
  async complete(
    lessonId: string,
    chapterId: string,
    userId: string,
    contextRole: string,
  ) {
    const { chapter } = await this.lessonService.readChapter(
      lessonId,
      chapterId,
      userId,
      contextRole,
    );

    await this.prisma.lessonProgress.upsert({
      where: { userId_chapterId: { userId, chapterId: chapter.uid } },
      create: { userId, chapterId: chapter.uid, lessonId },
      update: { completedAt: new Date() },
    });

    return { success: true };
  }

  /**
   * `photoIds` llega explícito desde el editor, no de parsear el Markdown:
   * parsear URLs del texto se rompe el día que alguien lo edita a mano.
   */
  private async syncPhotos(chapterId: string, photoIds?: string[]) {
    if (!photoIds) return;

    await this.prisma.chapterPhoto.deleteMany({ where: { chapterId } });
    if (photoIds.length === 0) return;

    await this.prisma.chapterPhoto.createMany({
      data: photoIds.map((photoId, sequence) => ({ chapterId, photoId, sequence })),
    });
  }
}
