import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { runWithoutTenant } from 'src/tenant/tenant-context';
import {
  MANAGE_ROLES,
  AUTHOR_EDITABLE_STATUSES,
  type CreateLessonUseCase,
  type UpdateLessonUseCase,
  type ReviewLessonUseCase,
} from './Lesson.interface';

/** Lo que toda lectura de lección trae consigo. */
const LESSON_INCLUDE = {
  category: { select: { uid: true, name: true, slug: true } },
  coverPhoto: { select: { uid: true, url: true } },
  author: { select: { uid: true, name: true, lastName: true } },
  institution: { select: { uid: true, name: true, slug: true } },
  _count: { select: { chapters: true } },
} as const;

@Injectable()
export class LessonService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /* =========================================================================
   * LECTURA — dos caminos, nunca uno condicional
   * ========================================================================= */

  /**
   * Camino 1: lecciones de MI institución.
   * Sin bypass. La extensión de Prisma inyecta el institutionId del request,
   * así que un uid de otra institución vuelve null acá y ni se evalúa.
   */
  private findInTenant(uid: string) {
    return this.prisma.lessons.findUnique({
      where: { uid },
      include: LESSON_INCLUDE,
    });
  }

  /**
   * Camino 2: lecciones publicadas de CUALQUIER institución.
   *
   * Uno de los dos únicos puntos del módulo que apaga el filtro de tenant.
   * `isPublic: true` va DENTRO del where a propósito: es lo que hace que esta
   * consulta no pueda devolver una lección no publicada, aunque quien la
   * escriba se distraiga. Si algún día se saca esa condición del where, es una
   * fuga cross-tenant total y silenciosa.
   */
  private findPublic(uid: string) {
    return runWithoutTenant(() =>
      this.prisma.lessons.findFirst({
        where: { uid, isPublic: true, isActive: true },
        include: LESSON_INCLUDE,
      }),
    );
  }

  /**
   * El otro punto con bypass.
   *
   * PRECONDICIÓN: `lessonId` salió de `findPublic()`, o sea que la lección está
   * publicada. Es el único lugar del módulo donde la garantía no está en el
   * where de la propia consulta sino en el paso anterior — por eso es privado
   * y por eso nadie lo llama sin haber resuelto la lección primero.
   */
  private findPublicChapters(lessonId: string) {
    return runWithoutTenant(() =>
      this.prisma.chapters.findMany({
        where: { lessonId, isActive: true },
        orderBy: { sequence: 'asc' },
      }),
    );
  }

  /**
   * Resuelve una lección legible y dice POR QUÉ CAMINO salió. Intenta el
   * scoped primero: una lección propia se resuelve sin apagar el filtro ni
   * una sola vez.
   *
   * `crossTenant` no es informativo — es lo que decide si sus capítulos
   * necesitan el bypass. Sin esa bandera habría que inferirlo de una lista
   * vacía, y "vacío" significa dos cosas distintas: "no tiene capítulos" o
   * "son de otro tenant y la extensión los filtró".
   */
  private async resolveLesson(uid: string, userId: string, contextRole: string) {
    const own = await this.findInTenant(uid);
    if (own) {
      this.assertCanReadOwnLesson(own, userId, contextRole);
      return { lesson: own, crossTenant: false };
    }

    const published = await this.findPublic(uid);
    if (!published) {
      throw new NotFoundException('La lección no existe o no está disponible');
    }
    return { lesson: published, crossTenant: true };
  }

  /** La única puerta de lectura del detalle. */
  async getReadableLesson(uid: string, userId: string, contextRole: string) {
    const { lesson } = await this.resolveLesson(uid, userId, contextRole);
    return lesson;
  }

  /**
   * Reglas de estado sobre una lección de la institución activa. NO decide
   * nada sobre otras instituciones: eso lo resuelve el `isPublic` del where.
   *
   * 404 y no 403: un 403 confirmaría que la lección existe.
   */
  private assertCanReadOwnLesson(
    lesson: { authorId: string; institutionStatus: string },
    userId: string,
    contextRole: string,
  ) {
    if (lesson.authorId === userId) return;
    if (MANAGE_ROLES.includes(contextRole)) return;
    if (lesson.institutionStatus === 'APPROVED') return;

    throw new NotFoundException('La lección no existe o no está disponible');
  }

  /**
   * Devuelve la lección si el usuario puede editarla. El autor la pierde
   * cuando pasa a PENDING o APPROVED: si pudiera editarla después de
   * aprobada, la revisión no significaría nada.
   */
  async assertCanEditLesson(uid: string, userId: string, contextRole: string) {
    const lesson = await this.findInTenant(uid);
    if (!lesson) throw new NotFoundException('La lección no existe');

    if (MANAGE_ROLES.includes(contextRole)) return lesson;
    if (
      lesson.authorId === userId &&
      AUTHOR_EDITABLE_STATUSES.includes(lesson.institutionStatus)
    ) {
      return lesson;
    }

    throw new NotFoundException('La lección no existe');
  }

  /**
   * Capítulos de una lección legible. Elige la fuente según por qué camino
   * salió la lección: si es de otra institución, sus capítulos también están
   * fuera del tenant y necesitan el mismo bypass.
   */
  async readChapters(lessonUid: string, userId: string, contextRole: string) {
    const { lesson, crossTenant } = await this.resolveLesson(
      lessonUid,
      userId,
      contextRole,
    );

    // El bypass se usa SOLO cuando la lección salió del camino publicado, que
    // es exactamente la precondición de findPublicChapters. Una lección propia
    // lee sus capítulos con el filtro puesto.
    if (crossTenant) return this.findPublicChapters(lesson.uid);

    return this.prisma.chapters.findMany({
      where: { lessonId: lesson.uid, isActive: true },
      orderBy: { sequence: 'asc' },
    });
  }

  /**
   * Un capítulo con su navegación. `prevUid` y `nextUid` los calcula el
   * backend y no el cliente: la pantalla de lectura tiene que poder navegar
   * sin haberse traído la lista entera, y sin depender de que su orden
   * coincida con el del servidor.
   */
  async readChapter(
    lessonUid: string,
    chapterUid: string,
    userId: string,
    contextRole: string,
  ) {
    const chapters = await this.readChapters(lessonUid, userId, contextRole);

    const index = chapters.findIndex((c) => c.uid === chapterUid);
    if (index === -1) {
      throw new NotFoundException('El capítulo no existe en esta lección');
    }

    // LessonProgress NO es scoped: se filtra siempre por userId explícito.
    const progress = await this.prisma.lessonProgress.findMany({
      where: { userId, lessonId: lessonUid },
      select: { chapterId: true },
    });
    const done = new Set(progress.map((p) => p.chapterId));

    return {
      chapter: chapters[index],
      prevUid: index > 0 ? chapters[index - 1].uid : null,
      nextUid: index < chapters.length - 1 ? chapters[index + 1].uid : null,
      completed: done.has(chapterUid),
      totalChapters: chapters.length,
      completedChapters: chapters.filter((c) => done.has(c.uid)).length,
    };
  }

  /* =========================================================================
   * ESCRITURA
   * ========================================================================= */

  /**
   * `institutionId` NO se escribe: la extensión lo inyecta. La categoría se
   * hereda del grupo cuando hay grupo, porque el grupo es la procedencia; sin
   * grupo hay que declararla, que es el caso del rector creando sin aula.
   */
  async createLesson(input: CreateLessonUseCase) {
    let categoryId = input.categoryId;

    if (input.groupId) {
      const group = await this.prisma.groups.findUnique({
        where: { uid: input.groupId },
        select: { uid: true, categoryId: true },
      });
      if (!group) throw new NotFoundException('El grupo no existe');
      categoryId = group.categoryId;
    } else {
      if (!categoryId) {
        throw new BadRequestException(
          'Sin grupo de origen hay que indicar la categoría de la lección',
        );
      }
      const category = await this.prisma.groupCategory.findUnique({
        where: { uid: categoryId },
        select: { uid: true },
      });
      if (!category) throw new NotFoundException('La categoría no existe');
    }

    // `institutionId` no se declara acá: la extensión de Prisma la inyecta
    // en la escritura real y la pisa si estuviera. El cast es solo para que
    // TypeScript acepte el literal sin ese campo obligatorio en el tipo
    // generado; en runtime el shape es exactamente este.
    return this.prisma.lessons.create({
      data: {
        title: input.title,
        summary: input.summary,
        categoryId: categoryId as string,
        groupId: input.groupId,
        authorId: input.authorId,
        institutionStatus: 'DRAFT',
      } as Parameters<typeof this.prisma.lessons.create>[0]['data'],
    });
  }

  /**
   * La categoría solo se puede cambiar en DRAFT: una vez enviada a revisión,
   * cambiarla movería la lección de vitrina sin que nadie la vuelva a mirar.
   */
  async updateLesson(input: UpdateLessonUseCase) {
    const lesson = await this.assertCanEditLesson(
      input.lessonId,
      input.userId,
      input.contextRole,
    );

    if (input.data.categoryId && lesson.institutionStatus !== 'DRAFT') {
      throw new BadRequestException(
        'La categoría solo se puede cambiar mientras la lección es un borrador',
      );
    }

    return this.prisma.lessons.update({
      where: { uid: input.lessonId },
      data: {
        title: input.data.title,
        summary: input.data.summary,
        categoryId: input.data.categoryId,
        coverPhotoId: input.data.coverPhotoId,
      },
    });
  }

  /** Borrar es desactivar: una lección con progreso de estudiantes no se borra. */
  async deactivateLesson(uid: string, userId: string, contextRole: string) {
    await this.assertCanEditLesson(uid, userId, contextRole);
    await this.prisma.lessons.update({
      where: { uid },
      data: { isActive: false, isPublic: false },
    });
  }

  /* =========================================================================
   * LISTADOS
   * ========================================================================= */

  /** Las del docente, en todos sus estados. */
  getMine(userId: string) {
    return this.prisma.lessons.findMany({
      where: { authorId: userId, isActive: true },
      include: LESSON_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Todas las de la institución activa, en todos sus estados. */
  getForInstitution(institutionStatus?: string) {
    return this.prisma.lessons.findMany({
      where: {
        isActive: true,
        ...(institutionStatus ? { institutionStatus: institutionStatus as never } : {}),
      },
      include: LESSON_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Lo que un estudiante puede estudiar hoy.
   *
   * Sin `categorySlug`, el filtro por defecto son las categorías de sus
   * grupos: el del grupo de Artes ve Artes y nada más. Sin grupos no se
   * filtra — filtrar a vacío se lee como "no hay lecciones", que es mentira.
   */
  async getAvailable(userId: string, institutionId: string, categorySlug?: string) {
    const categoryFilter = await this.resolveCategoryFilter(
      userId,
      institutionId,
      categorySlug,
    );

    return this.prisma.lessons.findMany({
      where: { isActive: true, institutionStatus: 'APPROVED', ...categoryFilter },
      include: LESSON_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * `UsersGroups` es tabla puente sin institutionId: la extensión no la filtra.
   * Por eso se entra siempre por el grupo — consultarla solo por userId
   * devuelve los grupos de todas las instituciones del usuario, que fue una
   * fuga real (ver errors/multitenant/2026-08-09-fuga-cross-tenant-en-groups-mine).
   */
  private async resolveCategoryFilter(
    userId: string,
    institutionId: string,
    categorySlug?: string,
  ) {
    if (categorySlug) {
      const category = await this.prisma.groupCategory.findUnique({
        where: { slug: categorySlug },
        select: { uid: true },
      });
      if (!category) throw new NotFoundException('La categoría no existe');
      return { categoryId: category.uid };
    }

    const memberships = await this.prisma.usersGroups.findMany({
      where: { userId, group: { institutionId } },
      select: { group: { select: { categoryId: true } } },
    });

    const categoryIds = [...new Set(memberships.map((m) => m.group.categoryId))];
    if (categoryIds.length === 0) return {};

    return { categoryId: { in: categoryIds } };
  }

  /* =========================================================================
   * FLUJO — nivel 1, la institución
   * ========================================================================= */

  /**
   * Enviar a revisión. Exige al menos un capítulo activo: mandar una lección
   * vacía a la cola le hace perder el tiempo a quien revisa.
   */
  async submitForReview(lessonId: string, userId: string, contextRole: string) {
    const lesson = await this.assertCanEditLesson(lessonId, userId, contextRole);

    if (!AUTHOR_EDITABLE_STATUSES.includes(lesson.institutionStatus)) {
      throw new BadRequestException(
        'Solo se puede enviar a revisión una lección en borrador o rechazada',
      );
    }

    const chapters = await this.prisma.chapters.count({
      where: { lessonId, isActive: true },
    });
    if (chapters === 0) {
      throw new BadRequestException(
        'La lección necesita al menos un capítulo para enviarse a revisión',
      );
    }

    return this.prisma.lessons.update({
      where: { uid: lessonId },
      data: { institutionStatus: 'PENDING', institutionFeedback: null },
    });
  }

  /**
   * Nivel 1. Rechazar exige motivo: sin feedback el docente tiene que
   * adivinar qué corregir. Mismo criterio que Products.feedback.
   */
  async reviewByInstitution(input: ReviewLessonUseCase) {
    const lesson = await this.findInTenant(input.lessonId);
    if (!lesson) throw new NotFoundException('La lección no existe');

    if (lesson.institutionStatus !== 'PENDING') {
      throw new BadRequestException(
        'Solo se puede revisar una lección que esté pendiente',
      );
    }
    if (!input.approve && !input.feedback?.trim()) {
      throw new BadRequestException('Rechazar una lección exige indicar el motivo');
    }

    return this.prisma.lessons.update({
      where: { uid: input.lessonId },
      data: {
        institutionStatus: input.approve ? 'APPROVED' : 'REJECTED',
        institutionFeedback: input.feedback ?? null,
        institutionReviewedBy: input.reviewerId,
        institutionReviewedAt: new Date(),
      },
    });
  }

  /* =========================================================================
   * FLUJO — nivel 2, la oferta global de Quyca
   * ========================================================================= */

  /**
   * El catálogo cross-tenant. Segundo y último punto del módulo que apaga el
   * filtro de tenant; igual que findPublic, `isPublic: true` va dentro del
   * where y es lo único que impide devolver lecciones privadas de terceros.
   */
  async getGlobalCatalog(categorySlug?: string) {
    let categoryFilter = {};
    if (categorySlug) {
      const category = await this.prisma.groupCategory.findUnique({
        where: { slug: categorySlug },
        select: { uid: true },
      });
      if (!category) throw new NotFoundException('La categoría no existe');
      categoryFilter = { categoryId: category.uid };
    }

    return runWithoutTenant(() =>
      this.prisma.lessons.findMany({
        where: { isPublic: true, isActive: true, ...categoryFilter },
        include: LESSON_INCLUDE,
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }

  /** Postular a la oferta global. Exige haber pasado el nivel 1. */
  async submitGlobal(lessonId: string) {
    const lesson = await this.findInTenant(lessonId);
    if (!lesson) throw new NotFoundException('La lección no existe');

    if (lesson.institutionStatus !== 'APPROVED') {
      throw new BadRequestException(
        'Antes de postularla a la oferta global, la institución tiene que aprobarla',
      );
    }

    return this.prisma.lessons.update({
      where: { uid: lessonId },
      data: { globalStatus: 'PENDING', globalFeedback: null },
    });
  }

  /**
   * Retirar del catálogo sin perder la aprobación. Borrar globalStatus haría
   * que republicar exigiera volver a pasar por revisión.
   */
  async unpublish(lessonId: string) {
    const lesson = await this.findInTenant(lessonId);
    if (!lesson) throw new NotFoundException('La lección no existe');

    return this.prisma.lessons.update({
      where: { uid: lessonId },
      data: { isPublic: false },
    });
  }

  /* ---- SUPER_ADMIN. Corren con el bypass del CrossTenantGuard ya activo ---- */

  getAdminQueue(globalStatus?: string) {
    return this.prisma.lessons.findMany({
      where: {
        isActive: true,
        ...(globalStatus
          ? { globalStatus: globalStatus as never }
          : { globalStatus: { not: null } }),
      },
      include: LESSON_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Nivel 2. Aprobar enciende `isPublic` en la MISMA escritura: son los dos
   * únicos lugares del módulo que tocan esa columna (el otro es unpublish),
   * y así no pueden quedar desincronizados.
   */
  async reviewGlobal(input: ReviewLessonUseCase) {
    const lesson = await this.prisma.lessons.findFirst({
      where: { uid: input.lessonId, isActive: true },
    });
    if (!lesson) throw new NotFoundException('La lección no existe');

    if (lesson.globalStatus !== 'PENDING') {
      throw new BadRequestException(
        'Solo se puede revisar una lección postulada a la oferta global',
      );
    }
    if (!input.approve && !input.feedback?.trim()) {
      throw new BadRequestException('Rechazar una lección exige indicar el motivo');
    }

    return this.prisma.lessons.update({
      where: { uid: input.lessonId },
      data: {
        globalStatus: input.approve ? 'APPROVED' : 'REJECTED',
        isPublic: input.approve,
        globalFeedback: input.feedback ?? null,
        globalReviewedBy: input.reviewerId,
        globalReviewedAt: new Date(),
      },
    });
  }
}
