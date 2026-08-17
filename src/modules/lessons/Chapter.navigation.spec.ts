import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LessonService } from './Lesson.service';
import { PrismaService } from 'src/prisma/prisma.service';

const LESSON = 'l-guitarra';
const LECTOR = 'u-estudiante';

const CHAPTERS = [
  { uid: 'cap-1', sequence: 1, title: 'Partes de la guitarra' },
  { uid: 'cap-2', sequence: 2, title: 'Las cuerdas' },
  { uid: 'cap-3', sequence: 3, title: '¿Qué son los acordes?' },
];

describe('LessonService.readChapter — navegación anterior/siguiente', () => {
  let service: LessonService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lessons: {
        findUnique: jest.fn().mockResolvedValue({
          uid: LESSON,
          authorId: 'u-autor',
          institutionStatus: 'APPROVED',
          isActive: true,
        }),
        findFirst: jest.fn(),
      },
      chapters: { findMany: jest.fn().mockResolvedValue(CHAPTERS) },
      lessonProgress: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [LessonService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LessonService);
  });

  it('el primero no tiene anterior', async () => {
    const result = await service.readChapter(LESSON, 'cap-1', LECTOR, 'student');

    expect(result.prevUid).toBeNull();
    expect(result.nextUid).toBe('cap-2');
  });

  it('el del medio tiene los dos', async () => {
    const result = await service.readChapter(LESSON, 'cap-2', LECTOR, 'student');

    expect(result.prevUid).toBe('cap-1');
    expect(result.nextUid).toBe('cap-3');
  });

  it('el último no tiene siguiente', async () => {
    const result = await service.readChapter(LESSON, 'cap-3', LECTOR, 'student');

    expect(result.prevUid).toBe('cap-2');
    expect(result.nextUid).toBeNull();
  });

  it('un capítulo que no es de esta lección es 404', async () => {
    await expect(
      service.readChapter(LESSON, 'cap-de-otra', LECTOR, 'student'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('informa si el lector ya lo completó', async () => {
    prisma.lessonProgress.findMany.mockResolvedValue([{ chapterId: 'cap-2' }]);

    const result = await service.readChapter(LESSON, 'cap-2', LECTOR, 'student');

    expect(result.completed).toBe(true);
  });

  it('el progreso se consulta siempre acotado al usuario', async () => {
    await service.readChapter(LESSON, 'cap-1', LECTOR, 'student');

    // LessonProgress no es scoped: sin el userId explícito devolvería el
    // avance de todo el mundo.
    expect(prisma.lessonProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: LECTOR, lessonId: LESSON }),
      }),
    );
  });
});
