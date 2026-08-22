import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LessonService } from './Lesson.service';
import { PrismaService } from 'src/prisma/prisma.service';

const LESSON = 'l-guitarra';
const AUTOR = 'u-autor';
const RECTOR = 'u-rector';

describe('LessonService — flujo de aprobación de la institución', () => {
  let service: LessonService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lessons: {
        findUnique: jest.fn().mockResolvedValue({
          uid: LESSON,
          authorId: AUTOR,
          institutionStatus: 'DRAFT',
          isActive: true,
        }),
        update: jest.fn().mockResolvedValue({ uid: LESSON }),
      },
      chapters: { count: jest.fn().mockResolvedValue(3) },
    };

    const module = await Test.createTestingModule({
      providers: [LessonService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LessonService);
  });

  it('enviar a revisión pasa de DRAFT a PENDING', async () => {
    await service.submitForReview(LESSON, AUTOR, 'institutional');

    expect(prisma.lessons.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ institutionStatus: 'PENDING' }),
      }),
    );
  });

  // Mandar a revisión una lección vacía le hace perder el tiempo al rector.
  it('una lección sin capítulos no se puede enviar', async () => {
    prisma.chapters.count.mockResolvedValue(0);

    await expect(
      service.submitForReview(LESSON, AUTOR, 'institutional'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Con el rector y no con el autor: el autor de una lección APPROVED ya
  // choca antes, en assertCanEditLesson, y tira NotFound. Este caso prueba la
  // guarda de estado, que es lo único que protege al rector de reenviar algo
  // ya aprobado.
  it('una lección ya aprobada no se vuelve a enviar', async () => {
    prisma.lessons.findUnique.mockResolvedValue({
      uid: LESSON,
      authorId: AUTOR,
      institutionStatus: 'APPROVED',
      isActive: true,
    });

    await expect(
      service.submitForReview(LESSON, RECTOR, 'rector'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aprobar deja el revisor y la fecha registrados', async () => {
    prisma.lessons.findUnique.mockResolvedValue({
      uid: LESSON,
      authorId: AUTOR,
      institutionStatus: 'PENDING',
      isActive: true,
    });

    await service.reviewByInstitution({
      lessonId: LESSON,
      reviewerId: RECTOR,
      approve: true,
    });

    const data = prisma.lessons.update.mock.calls[0][0].data;
    expect(data.institutionStatus).toBe('APPROVED');
    expect(data.institutionReviewedBy).toBe(RECTOR);
    expect(data.institutionReviewedAt).toBeInstanceOf(Date);
  });

  it('rechazar exige feedback: sin motivo el docente adivina', async () => {
    prisma.lessons.findUnique.mockResolvedValue({
      uid: LESSON,
      authorId: AUTOR,
      institutionStatus: 'PENDING',
      isActive: true,
    });

    await expect(
      service.reviewByInstitution({
        lessonId: LESSON,
        reviewerId: RECTOR,
        approve: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('solo se revisa lo que está PENDING', async () => {
    prisma.lessons.findUnique.mockResolvedValue({
      uid: LESSON,
      authorId: AUTOR,
      institutionStatus: 'DRAFT',
      isActive: true,
    });

    await expect(
      service.reviewByInstitution({
        lessonId: LESSON,
        reviewerId: RECTOR,
        approve: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
