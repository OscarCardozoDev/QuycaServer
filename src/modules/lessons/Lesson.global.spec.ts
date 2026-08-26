import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LessonService } from './Lesson.service';
import { PrismaService } from 'src/prisma/prisma.service';

const LESSON = 'l-guitarra';
const ADMIN = 'u-superadmin';

describe('LessonService — la oferta global', () => {
  let service: LessonService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lessons: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ uid: LESSON }),
      },
      groupCategory: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [LessonService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LessonService);
  });

  it('el catálogo filtra por isPublic dentro del where', async () => {
    await service.getGlobalCatalog();

    expect(prisma.lessons.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublic: true, isActive: true }),
      }),
    );
  });

  it('el catálogo acepta filtro por slug de categoría', async () => {
    prisma.groupCategory.findUnique.mockResolvedValue({ uid: 'c-musica' });

    await service.getGlobalCatalog('musica');

    expect(prisma.lessons.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublic: true, categoryId: 'c-musica' }),
      }),
    );
  });

  // Postular a la oferta global exige haber pasado el nivel 1.
  it('no se postula una lección que la institución no aprobó', async () => {
    prisma.lessons.findUnique.mockResolvedValue({
      uid: LESSON,
      institutionStatus: 'PENDING',
      isActive: true,
    });

    await expect(service.submitGlobal(LESSON)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('postular deja globalStatus en PENDING y NO publica', async () => {
    prisma.lessons.findUnique.mockResolvedValue({
      uid: LESSON,
      institutionStatus: 'APPROVED',
      isActive: true,
    });

    await service.submitGlobal(LESSON);

    const data = prisma.lessons.update.mock.calls[0][0].data;
    expect(data.globalStatus).toBe('PENDING');
    expect(data.isPublic).toBeUndefined();
  });

  it('aprobar globalmente enciende isPublic en la misma escritura', async () => {
    prisma.lessons.findFirst.mockResolvedValue({
      uid: LESSON,
      globalStatus: 'PENDING',
      isActive: true,
    });

    await service.reviewGlobal({
      lessonId: LESSON,
      reviewerId: ADMIN,
      approve: true,
    });

    const data = prisma.lessons.update.mock.calls[0][0].data;
    expect(data.globalStatus).toBe('APPROVED');
    expect(data.isPublic).toBe(true);
    expect(data.globalReviewedBy).toBe(ADMIN);
  });

  it('rechazar globalmente no publica', async () => {
    prisma.lessons.findFirst.mockResolvedValue({
      uid: LESSON,
      globalStatus: 'PENDING',
      isActive: true,
    });

    await service.reviewGlobal({
      lessonId: LESSON,
      reviewerId: ADMIN,
      approve: false,
      feedback: 'El capítulo 2 no tiene contenido.',
    });

    const data = prisma.lessons.update.mock.calls[0][0].data;
    expect(data.globalStatus).toBe('REJECTED');
    expect(data.isPublic).toBe(false);
  });

  // Retirar del catálogo no es perder la aprobación: si la borrara,
  // republicar exigiria volver a pasar por revisión.
  it('unpublish apaga isPublic y NO toca globalStatus', async () => {
    prisma.lessons.findUnique.mockResolvedValue({
      uid: LESSON,
      globalStatus: 'APPROVED',
      isActive: true,
    });

    await service.unpublish(LESSON);

    const data = prisma.lessons.update.mock.calls[0][0].data;
    expect(data.isPublic).toBe(false);
    expect(data.globalStatus).toBeUndefined();
  });
});
