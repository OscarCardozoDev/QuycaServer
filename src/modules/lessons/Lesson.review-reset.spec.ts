import { Test } from '@nestjs/testing';
import { LessonService } from './Lesson.service';
import { PrismaService } from 'src/prisma/prisma.service';

const LESSON = 'l-guitarra';
const AUTOR = 'u-autor';

function lessonRow(over: Record<string, unknown> = {}) {
  return {
    uid: LESSON,
    title: 'Básico Guitarra 1',
    authorId: AUTOR,
    institutionStatus: 'APPROVED',
    globalStatus: 'APPROVED',
    isPublic: true,
    isActive: true,
    ...over,
  };
}

/**
 * El contrapeso de que el autor pueda editar en cualquier estado
 * (`assertCanEditLesson`). Sin este reseteo, una lección se aprueba una vez y
 * después se le cambia el contenido entero sin que nadie lo vuelva a mirar —
 * y si además estaba en el catálogo, ese contenido sin revisar lo estarían
 * viendo usuarios de otras instituciones.
 */
describe('LessonService.markForReview', () => {
  let service: LessonService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lessons: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...lessonRow(), ...data })),
      },
      groupCategory: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [LessonService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LessonService);
  });

  it('una aprobada vuelve a PENDING', async () => {
    prisma.lessons.findUnique.mockResolvedValue(lessonRow());

    await service.markForReview(LESSON);

    expect(prisma.lessons.update).toHaveBeenCalledTimes(1);
    const { data } = prisma.lessons.update.mock.calls[0][0];
    expect(data.institutionStatus).toBe('PENDING');
  });

  /**
   * Lo que más importa de los dos niveles: el contenido que Quyca aprobó ya no
   * es el que está guardado, así que sale del catálogo. Es la diferencia con
   * `unpublish()`, que conserva `globalStatus` justamente porque ahí el
   * contenido no cambió.
   */
  it('sale del catálogo global y pierde su aprobación de Quyca', async () => {
    prisma.lessons.findUnique.mockResolvedValue(lessonRow());

    await service.markForReview(LESSON);

    const { data } = prisma.lessons.update.mock.calls[0][0];
    expect(data.isPublic).toBe(false);
    expect(data.globalStatus).toBeNull();
  });

  it('borra el veredicto anterior de la institución', async () => {
    prisma.lessons.findUnique.mockResolvedValue(lessonRow());

    await service.markForReview(LESSON);

    const { data } = prisma.lessons.update.mock.calls[0][0];
    expect(data.institutionFeedback).toBeNull();
    expect(data.institutionReviewedBy).toBeNull();
    expect(data.institutionReviewedAt).toBeNull();
  });

  /**
   * Forzar un borrador a PENDING le sacaría al autor el botón "Enviar a
   * revisión" y mandaría a la cola capítulos a medio escribir. Un DRAFT nunca
   * se revisó: no hay aprobación que invalidar.
   */
  it('un borrador se queda en DRAFT', async () => {
    prisma.lessons.findUnique.mockResolvedValue(
      lessonRow({ institutionStatus: 'DRAFT', globalStatus: null, isPublic: false }),
    );

    await expect(service.markForReview(LESSON)).resolves.toBeNull();
    expect(prisma.lessons.update).not.toHaveBeenCalled();
  });

  it('una que ya está en la cola no se toca', async () => {
    prisma.lessons.findUnique.mockResolvedValue(
      lessonRow({ institutionStatus: 'PENDING' }),
    );

    await service.markForReview(LESSON);
    expect(prisma.lessons.update).not.toHaveBeenCalled();
  });

  /** El autor está corrigiendo: reenviar lo decide él, con `submit`. */
  it('una rechazada se queda rechazada', async () => {
    prisma.lessons.findUnique.mockResolvedValue(
      lessonRow({ institutionStatus: 'REJECTED' }),
    );

    await service.markForReview(LESSON);
    expect(prisma.lessons.update).not.toHaveBeenCalled();
  });

  /**
   * `findInTenant` es un `findUnique` sin bypass: una lección de otra
   * institución vuelve null y no hay nada que resetear. Que no explote
   * importa porque `markForReview` se llama al final de cada mutación, no
   * como una puerta.
   */
  it('una lección de otro tenant no rompe nada', async () => {
    prisma.lessons.findUnique.mockResolvedValue(null);

    await expect(service.markForReview(LESSON)).resolves.toBeNull();
    expect(prisma.lessons.update).not.toHaveBeenCalled();
  });

  describe('updateLesson lo dispara', () => {
    it('editar el título de una aprobada la devuelve a la cola', async () => {
      prisma.lessons.findUnique.mockResolvedValue(lessonRow());

      const out = await service.updateLesson({
        lessonId: LESSON,
        userId: AUTOR,
        contextRole: 'institutional',
        data: { title: 'Guitarra Básica I' },
      });

      // Dos updates: el del contenido y el del reseteo.
      expect(prisma.lessons.update).toHaveBeenCalledTimes(2);
      // Y lo devuelto es la fila DESPUÉS del reseteo: la del primer update
      // todavía dice APPROVED y la pantalla pintaría el badge viejo.
      expect(out).toMatchObject({ institutionStatus: 'PENDING' });
    });

    it('editar un borrador no lo manda a la cola', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'DRAFT', globalStatus: null, isPublic: false }),
      );

      await service.updateLesson({
        lessonId: LESSON,
        userId: AUTOR,
        contextRole: 'institutional',
        data: { title: 'Guitarra Básica I' },
      });

      expect(prisma.lessons.update).toHaveBeenCalledTimes(1);
    });
  });
});
