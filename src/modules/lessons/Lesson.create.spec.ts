import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LessonService } from './Lesson.service';
import { PrismaService } from 'src/prisma/prisma.service';

const INSTITUCION = 'i-usta';
const AUTOR = 'u-autor';
const GRUPO_ARTES = 'g-artes';
const CAT_ARTES = 'c-artes';

describe('LessonService.createLesson', () => {
  let service: LessonService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lessons: { create: jest.fn().mockResolvedValue({ uid: 'l-nueva' }) },
      groups: { findUnique: jest.fn() },
      groupCategory: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [LessonService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LessonService);
  });

  it('hereda la categoría del grupo de origen', async () => {
    prisma.groups.findUnique.mockResolvedValue({
      uid: GRUPO_ARTES,
      categoryId: CAT_ARTES,
    });

    await service.createLesson({
      title: 'Básico Guitarra 1',
      groupId: GRUPO_ARTES,
      authorId: AUTOR,
      institutionId: INSTITUCION,
    });

    expect(prisma.lessons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: CAT_ARTES,
          groupId: GRUPO_ARTES,
          authorId: AUTOR,
          institutionStatus: 'DRAFT',
        }),
      }),
    );
  });

  // El grupo llega del cliente. Groups es scoped, así que un grupo de otra
  // institución vuelve null y no hay que dejar que se use igual.
  it('un grupo de otra institución es 404', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);

    await expect(
      service.createLesson({
        title: 'x',
        groupId: 'g-ajeno',
        authorId: AUTOR,
        institutionId: INSTITUCION,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin grupo, exige categoryId explícito', async () => {
    await expect(
      service.createLesson({
        title: 'x',
        authorId: AUTOR,
        institutionId: INSTITUCION,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin grupo pero con categoría válida, crea', async () => {
    prisma.groupCategory.findUnique.mockResolvedValue({ uid: CAT_ARTES });

    await service.createLesson({
      title: 'Taller del rector',
      categoryId: CAT_ARTES,
      authorId: AUTOR,
      institutionId: INSTITUCION,
    });

    expect(prisma.lessons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: CAT_ARTES, groupId: undefined }),
      }),
    );
  });

  // institutionId lo inyecta la extensión. Escribirlo a mano es ruido y
  // además la extensión lo pisa.
  it('no escribe institutionId a mano', async () => {
    prisma.groupCategory.findUnique.mockResolvedValue({ uid: CAT_ARTES });

    await service.createLesson({
      title: 'x',
      categoryId: CAT_ARTES,
      authorId: AUTOR,
      institutionId: INSTITUCION,
    });

    const data = prisma.lessons.create.mock.calls[0][0].data;
    expect(data.institutionId).toBeUndefined();
  });
});
