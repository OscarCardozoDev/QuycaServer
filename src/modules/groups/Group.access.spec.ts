import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupService } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';

const INST = 'inst-usta';
const ARTES_GROUP = 'g-artes';
const PROF_ARTES = 'u-prof-artes';
const PROF_MUSICA = 'u-prof-musica';
const ESTUDIANTE = 'u-estudiante';
const RECTOR = 'u-rector';

describe('GroupService — un grupo es cerrado dentro de su institución', () => {
  let service: GroupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      // Por defecto el grupo existe y su profesor a cargo es PROF_ARTES: lo
      // que cada test varía es QUIÉN pregunta, no si el grupo está.
      groups: {
        findUnique: jest.fn().mockResolvedValue({ uid: ARTES_GROUP, profesorId: PROF_ARTES }),
        update: jest.fn().mockResolvedValue({ uid: ARTES_GROUP }),
      },
      usersGroups: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      userInstitution: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(GroupService);
  });

  describe('ver el interior', () => {
    it('el rector ve cualquier grupo de su institución sin consultar membresía', async () => {
      await service.getAllStudentsByGroup(ARTES_GROUP, RECTOR, 'rector');

      expect(prisma.usersGroups.findUnique).not.toHaveBeenCalled();
    });

    it('un miembro del grupo ve la lista', async () => {
      prisma.usersGroups.findUnique.mockResolvedValue({ uid: 'ug-1' });

      await expect(
        service.getAllStudentsByGroup(ARTES_GROUP, ESTUDIANTE, 'student'),
      ).resolves.toBeDefined();
    });

    // El caso del pedido: el profesor de Música no puede saber qué estudiantes
    // tiene el grupo de ARTES.
    it('el profesor de otro grupo recibe 404, no 403', async () => {
      prisma.usersGroups.findUnique.mockResolvedValue(null);

      await expect(
        service.getAllStudentsByGroup(ARTES_GROUP, PROF_MUSICA, 'institutional'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('modificar', () => {
    it('el profesor a cargo edita su grupo', async () => {
      await expect(
        service.updateGroupUseCase({
          groupId: ARTES_GROUP,
          institutionId: INST,
          uid: PROF_ARTES,
          contextRole: 'institutional',
          data: { rules: 'Traer materiales propios.' },
        }),
      ).resolves.toEqual({ uid: ARTES_GROUP });
    });

    it('el profesor de otro grupo no edita', async () => {
      await expect(
        service.updateGroupUseCase({
          groupId: ARTES_GROUP,
          institutionId: INST,
          uid: PROF_MUSICA,
          contextRole: 'institutional',
          data: { rules: 'mías ahora' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('el coordinador edita sin ser el profesor a cargo', async () => {
      await expect(
        service.updateGroupUseCase({
          groupId: ARTES_GROUP,
          institutionId: INST,
          uid: 'u-coord',
          contextRole: 'coordinator',
          data: { name: 'Artes y Fotografía' },
        }),
      ).resolves.toEqual({ uid: ARTES_GROUP });

      expect(prisma.groups.findUnique).not.toHaveBeenCalled();
    });
  });
});
