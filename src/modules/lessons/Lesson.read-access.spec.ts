import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LessonService } from './Lesson.service';
import { PrismaService } from 'src/prisma/prisma.service';

const LESSON = 'l-guitarra';
const AUTOR = 'u-autor';
const RECTOR = 'u-rector';
const OTRO = 'u-otro';

function lessonRow(over: Record<string, unknown> = {}) {
  return {
    uid: LESSON,
    title: 'Básico Guitarra 1',
    authorId: AUTOR,
    institutionStatus: 'APPROVED',
    isPublic: false,
    isActive: true,
    ...over,
  };
}

describe('LessonService — los dos caminos de lectura', () => {
  let service: LessonService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lessons: { findUnique: jest.fn(), findFirst: jest.fn() },
      chapters: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [LessonService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LessonService);
  });

  describe('camino 1 — lecciones de mi propia institución', () => {
    it('el autor lee su borrador', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'DRAFT' }),
      );

      await expect(
        service.getReadableLesson(LESSON, AUTOR, 'institutional'),
      ).resolves.toMatchObject({ uid: LESSON });

      // No se cayó al camino publicado: no hizo falta apagar el filtro.
      expect(prisma.lessons.findFirst).not.toHaveBeenCalled();
    });

    it('el rector lee cualquier estado', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'PENDING' }),
      );

      await expect(
        service.getReadableLesson(LESSON, RECTOR, 'rector'),
      ).resolves.toBeDefined();
    });

    it('un estudiante NO lee un borrador de su institución', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'DRAFT' }),
      );

      await expect(
        service.getReadableLesson(LESSON, OTRO, 'student'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un estudiante SÍ lee una aprobada de su institución', async () => {
      prisma.lessons.findUnique.mockResolvedValue(lessonRow());

      await expect(
        service.getReadableLesson(LESSON, OTRO, 'student'),
      ).resolves.toBeDefined();
    });
  });

  describe('camino 2 — lecciones publicadas de otra institución', () => {
    beforeEach(() => {
      // La extensión de Prisma la filtró: no es de mi tenant.
      prisma.lessons.findUnique.mockResolvedValue(null);
    });

    it('la consulta sin filtro lleva isPublic: true en el where', async () => {
      prisma.lessons.findFirst.mockResolvedValue(lessonRow({ isPublic: true }));

      await service.getReadableLesson(LESSON, OTRO, 'student');

      // Esta es LA garantía del módulo: la condición viaja dentro del where,
      // no en un assert posterior que se pueda olvidar.
      expect(prisma.lessons.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            uid: LESSON,
            isPublic: true,
            isActive: true,
          }),
        }),
      );
    });

    it('una lección ajena no publicada es 404', async () => {
      prisma.lessons.findFirst.mockResolvedValue(null);

      await expect(
        service.getReadableLesson(LESSON, OTRO, 'student'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ni el rector de MI institución llega a una ajena sin publicar', async () => {
      prisma.lessons.findFirst.mockResolvedValue(null);

      await expect(
        service.getReadableLesson(LESSON, RECTOR, 'rector'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertCanEditLesson', () => {
    it('el rector edita siempre', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'APPROVED' }),
      );

      await expect(
        service.assertCanEditLesson(LESSON, RECTOR, 'rector'),
      ).resolves.toBeDefined();
    });

    it('el autor edita su borrador', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'DRAFT' }),
      );

      await expect(
        service.assertCanEditLesson(LESSON, AUTOR, 'institutional'),
      ).resolves.toBeDefined();
    });

    it('el autor edita una rechazada, para poder corregirla', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'REJECTED' }),
      );

      await expect(
        service.assertCanEditLesson(LESSON, AUTOR, 'institutional'),
      ).resolves.toBeDefined();
    });

    // Antes esto estaba prohibido, con el argumento de que si no la revisión
    // no significaría nada. Lo que la protege ahora es `markForReview()`: el
    // autor corrige, y la lección vuelve sola a la cola. Cerrarle la puerta
    // acá dejaba a un docente sin poder arreglar una errata de su propia
    // lección sin pedirle el favor al rector.
    it('el autor edita una aprobada — el reseteo lo hace markForReview', async () => {
      prisma.lessons.findUnique.mockResolvedValue(lessonRow());

      await expect(
        service.assertCanEditLesson(LESSON, AUTOR, 'institutional'),
      ).resolves.toBeDefined();
    });

    it('el autor edita una que ya está en la cola', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'PENDING' }),
      );

      await expect(
        service.assertCanEditLesson(LESSON, AUTOR, 'institutional'),
      ).resolves.toBeDefined();
    });

    it('otro docente no edita la ajena', async () => {
      prisma.lessons.findUnique.mockResolvedValue(
        lessonRow({ institutionStatus: 'DRAFT' }),
      );

      await expect(
        service.assertCanEditLesson(LESSON, OTRO, 'institutional'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
