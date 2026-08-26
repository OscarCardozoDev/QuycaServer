import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LessonService } from './Lesson.service';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * El revisor de Quyca no podía LEER lo que tenía que revisar.
 *
 * `GET /lessons/get/:uid` entra por `getReadableLesson`, y sus dos caminos le
 * cierran la puerta al admin justo en el caso que le importa:
 *
 *  1. el scoped filtra por la institución activa del admin, que no es la de
 *     la lección;
 *  2. el publicado exige `isPublic: true`, y `isPublic` recién se enciende
 *     cuando el admin APRUEBA.
 *
 * O sea: 404 sobre toda su cola. Aprobaba a ciegas. Estas pruebas fijan que
 * el camino del admin no arrastre ninguna de las dos condiciones.
 */

const LESSON = 'l-de-otra-institucion';
const ADMIN = 'u-super-admin';

const CHAPTERS = [
  { uid: 'cap-1', sequence: 1, title: 'Partes de la guitarra' },
  { uid: 'cap-2', sequence: 2, title: 'Las cuerdas' },
];

function lessonRow(over: Record<string, unknown> = {}) {
  return {
    uid: LESSON,
    title: 'Básico Guitarra 1',
    authorId: 'u-autor-ajeno',
    institutionStatus: 'APPROVED',
    globalStatus: 'PENDING',
    isPublic: false,
    isActive: true,
    ...over,
  };
}

describe('LessonService — la lectura del revisor de Quyca', () => {
  let service: LessonService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lessons: { findUnique: jest.fn(), findFirst: jest.fn() },
      chapters: { findMany: jest.fn().mockResolvedValue(CHAPTERS) },
      lessonProgress: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [LessonService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LessonService);
  });

  it('lee una lección postulada que TODAVÍA no es pública', async () => {
    prisma.lessons.findFirst.mockResolvedValue(lessonRow());

    await expect(service.getAdminLesson(LESSON)).resolves.toMatchObject({
      uid: LESSON,
      isPublic: false,
    });
  });

  it('el where NO lleva isPublic — eso es todo el bug', async () => {
    prisma.lessons.findFirst.mockResolvedValue(lessonRow());

    await service.getAdminLesson(LESSON);

    const { where } = prisma.lessons.findFirst.mock.calls[0][0];
    expect(where).toEqual({ uid: LESSON, isActive: true });
    expect(where).not.toHaveProperty('isPublic');
  });

  it('una lección desactivada sigue siendo 404', async () => {
    prisma.lessons.findFirst.mockResolvedValue(null);

    await expect(service.getAdminLesson(LESSON)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('trae los capítulos de la lección que revisa', async () => {
    prisma.lessons.findFirst.mockResolvedValue(lessonRow());

    const rows = await service.getAdminChapters(LESSON, ADMIN);

    expect(rows.map((c) => c.uid)).toEqual(['cap-1', 'cap-2']);
  });

  it('no inventa capítulos de una lección que no existe', async () => {
    prisma.lessons.findFirst.mockResolvedValue(null);

    await expect(service.getAdminChapters(LESSON, ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.chapters.findMany).not.toHaveBeenCalled();
  });

  it('un capítulo del admin trae la MISMA forma que la lectura normal', async () => {
    prisma.lessons.findFirst.mockResolvedValue(lessonRow());

    const detail = await service.getAdminChapter(LESSON, 'cap-1', ADMIN);

    expect(detail).toMatchObject({
      chapter: expect.objectContaining({ uid: 'cap-1' }),
      prevUid: null,
      nextUid: 'cap-2',
      completed: false,
      totalChapters: 2,
      completedChapters: 0,
    });
  });

  it('un capítulo que no es de esa lección es 404', async () => {
    prisma.lessons.findFirst.mockResolvedValue(lessonRow());

    await expect(
      service.getAdminChapter(LESSON, 'cap-de-otra', ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
