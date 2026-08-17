import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChapterService } from './Chapter.service';
import { LessonService } from './Lesson.service';
import { PrismaService } from 'src/prisma/prisma.service';

const LESSON = 'l-guitarra';
const AUTOR = 'u-autor';

describe('ChapterService', () => {
  let service: ChapterService;
  let prisma: any;
  let lessonService: any;

  beforeEach(async () => {
    prisma = {
      chapters: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 4 } }),
        create: jest.fn().mockResolvedValue({ uid: 'cap-5' }),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({ uid: 'cap-1' }),
        findMany: jest.fn().mockResolvedValue([
          { uid: 'cap-1' },
          { uid: 'cap-2' },
          { uid: 'cap-3' },
        ]),
      },
      chapterPhoto: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };

    lessonService = { assertCanEditLesson: jest.fn().mockResolvedValue({ uid: LESSON }) };

    const module = await Test.createTestingModule({
      providers: [
        ChapterService,
        { provide: PrismaService, useValue: prisma },
        { provide: LessonService, useValue: lessonService },
      ],
    }).compile();

    service = module.get(ChapterService);
  });

  it('el capítulo nuevo va al final: max + 1', async () => {
    await service.create(
      LESSON,
      { title: 'Feliz cumpleaños', contentMd: '# ...' },
      AUTOR,
      'institutional',
    );

    expect(prisma.chapters.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sequence: 5, lessonId: LESSON }),
      }),
    );
  });

  it('el primer capítulo de una lección vacía arranca en 1', async () => {
    prisma.chapters.aggregate.mockResolvedValue({ _max: { sequence: null } });

    await service.create(
      LESSON,
      { title: 'Partes de la guitarra', contentMd: '# ...' },
      AUTOR,
      'institutional',
    );

    expect(prisma.chapters.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequence: 1 }) }),
    );
  });

  it('crear un capítulo pasa por assertCanEditLesson', async () => {
    await service.create(LESSON, { title: 'x', contentMd: 'y' }, AUTOR, 'institutional');

    expect(lessonService.assertCanEditLesson).toHaveBeenCalledWith(
      LESSON,
      AUTOR,
      'institutional',
    );
  });

  it('reordenar reescribe 1..N en el orden pedido', async () => {
    await service.reorder(LESSON, ['cap-3', 'cap-1', 'cap-2'], AUTOR, 'institutional');

    const sequences = prisma.chapters.update.mock.calls.map((c: any) => [
      c[0].where.uid,
      c[0].data.sequence,
    ]);
    expect(sequences).toEqual([
      ['cap-3', 1],
      ['cap-1', 2],
      ['cap-2', 3],
    ]);
  });

  // Una lista incompleta dejaría huecos en la secuencia.
  it('reordenar con una lista incompleta falla', async () => {
    await expect(
      service.reorder(LESSON, ['cap-1', 'cap-2'], AUTOR, 'institutional'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reordenar con un uid ajeno a la lección falla', async () => {
    await expect(
      service.reorder(
        LESSON,
        ['cap-1', 'cap-2', 'cap-de-otra-leccion'],
        AUTOR,
        'institutional',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guardar sincroniza ChapterPhoto desde photoIds', async () => {
    await service.create(
      LESSON,
      { title: 'x', contentMd: 'y', photoIds: ['p-1', 'p-2'] },
      AUTOR,
      'institutional',
    );

    expect(prisma.chapterPhoto.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { chapterId: 'cap-5', photoId: 'p-1', sequence: 0 },
          { chapterId: 'cap-5', photoId: 'p-2', sequence: 1 },
        ],
      }),
    );
  });

  // Sin este chequeo, un chapterId de otra lección (dentro del mismo tenant)
  // pasaba directo al update: agujero intra-tenant.
  it('actualizar un capítulo ajeno a la lección falla con 404', async () => {
    prisma.chapters.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        LESSON,
        'cap-de-otra-leccion',
        { title: 'x', contentMd: 'y' },
        AUTOR,
        'institutional',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.chapters.update).not.toHaveBeenCalled();
  });

  it('desactivar un capítulo ajeno a la lección falla con 404', async () => {
    prisma.chapters.findFirst.mockResolvedValue(null);

    await expect(
      service.deactivate(LESSON, 'cap-de-otra-leccion', AUTOR, 'institutional'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.chapters.update).not.toHaveBeenCalled();
  });
});
