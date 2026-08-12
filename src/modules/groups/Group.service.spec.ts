import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupService } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * `UsersGroups` and `Users`/`UserInstitution` are deliberately NOT in
 * SCOPED_MODELS (see src/tenant/tenant.extension.ts) — the Prisma extension
 * does not filter them. `Groups` IS scoped, so a foreign-tenant `groupId`
 * resolves to `null` through `groups.findUnique`/`findMany` once the
 * extension is active. These specs model that behaviour directly against a
 * mocked PrismaService, per Group.service.ts's explicit "look up Groups
 * first" gate and its `assertActiveMembers` membership guard.
 */
describe('GroupService — tenant & membership enforcement', () => {
  let service: GroupService;
  let prisma: any;

  const institutionId = 'inst-1';

  beforeEach(async () => {
    prisma = {
      groups: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
      usersGroups: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        delete: jest.fn(),
      },
      users: { findUnique: jest.fn() },
      userInstitution: { findMany: jest.fn() },
      // No es la plataforma en estos casos: el límite de Task 2 no debe
      // activarse ni afectar estas suites de membership.
      institution: { findUnique: jest.fn().mockResolvedValue(null) },
      // La categoría se da por ofertada en estas suites: lo que se prueba acá
      // es la membresía, no la oferta. El rechazo por categoría no ofertada
      // vive en Group.offered-category.spec.ts.
      institutionCategory: { findUnique: jest.fn().mockResolvedValue({ uid: 'ic-1' }) },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('user-type-id') } },
      ],
    }).compile();

    service = module.get(GroupService);
  });

  describe('deleteStudentsByGroup (Critical 1)', () => {
    it('throws NotFoundException for a groupId outside the active tenant and never calls usersGroups.deleteMany', async () => {
      prisma.groups.findUnique.mockResolvedValue(null); // extension scoped it out

      await expect(service.deleteStudentsByGroup('foreign-group')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.usersGroups.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes when the group belongs to the active tenant', async () => {
      prisma.groups.findUnique.mockResolvedValue({ uid: 'g1' });
      prisma.usersGroups.deleteMany.mockResolvedValue({ count: 2 });

      await service.deleteStudentsByGroup('g1');

      expect(prisma.usersGroups.deleteMany).toHaveBeenCalledWith({ where: { groupId: 'g1' } });
    });
  });

  describe('getAllStudentsByGroup (Critical 2)', () => {
    it('throws NotFoundException for a groupId outside the active tenant and never reads the roster', async () => {
      prisma.groups.findUnique.mockResolvedValue(null); // extension scoped it out

      await expect(service.getAllStudentsByGroup('foreign-group')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.usersGroups.findMany).not.toHaveBeenCalled();
    });

    it('reads the roster when the group belongs to the active tenant', async () => {
      prisma.groups.findUnique.mockResolvedValue({ uid: 'g1' });
      prisma.usersGroups.findMany.mockResolvedValue([]);

      await service.getAllStudentsByGroup('g1');

      expect(prisma.usersGroups.findMany).toHaveBeenCalled();
    });
  });

  describe('addStudentToGroups (membership guard)', () => {
    it('throws ForbiddenException when the user has no membership in the active institution', async () => {
      prisma.groups.findMany.mockResolvedValue([{ uid: 'g1' }]);
      prisma.users.findUnique.mockResolvedValue({ uid: 'outsider' });
      prisma.userInstitution.findMany.mockResolvedValue([]); // no row at all

      await expect(
        service.addStudentToGroups({ userId: 'outsider', groupIds: ['g1'], institutionId }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.usersGroups.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the membership exists but is inactive (baja)', async () => {
      prisma.groups.findMany.mockResolvedValue([{ uid: 'g1' }]);
      prisma.users.findUnique.mockResolvedValue({ uid: 'u1' });
      // Membership baja in this project is by update (isActive: false), never
      // delete. The query filters isActive: true at the DB level, so a
      // baja'd row is excluded from the result just like a missing one.
      prisma.userInstitution.findMany.mockResolvedValue([]);

      await expect(
        service.addStudentToGroups({ userId: 'u1', groupIds: ['g1'], institutionId }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.userInstitution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true, institutionId }),
        }),
      );
    });

    it('succeeds when the user is an active member of the institution', async () => {
      prisma.groups.findMany.mockResolvedValue([{ uid: 'g1' }]);
      prisma.users.findUnique.mockResolvedValue({ uid: 'u1' });
      prisma.userInstitution.findMany.mockResolvedValue([{ userId: 'u1' }]);
      prisma.usersGroups.create.mockResolvedValue({ uid: 'ug1', groupId: 'g1' });

      const result = await service.addStudentToGroups({
        userId: 'u1',
        groupIds: ['g1'],
        institutionId,
      });

      expect(result.created).toBe(1);
    });
  });

  describe('updateStudentsByGroup (membership guard, array case)', () => {
    it('throws ForbiddenException naming the offending uid and never mutates usersGroups', async () => {
      prisma.groups.findUnique.mockResolvedValue({ uid: 'g1' });
      prisma.userInstitution.findMany.mockResolvedValue([{ userId: 'member-1' }]); // 'outsider' missing

      await expect(
        service.updateStudentsByGroup({
          groupId: 'g1',
          users: ['member-1', 'outsider'],
          institutionId,
        }),
      ).rejects.toThrow(/outsider/);
      expect(prisma.usersGroups.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('changeProfesor (membership guard)', () => {
    const baseGroup = { uid: 'g1', profesorId: 'old-prof' };

    it('throws ForbiddenException when newProfesorId has no UserInstitution row at all', async () => {
      prisma.groups.findUnique.mockResolvedValue(baseGroup);
      prisma.users.findUnique.mockResolvedValue({ uid: 'newProf', name: 'New' });
      prisma.userInstitution.findMany.mockResolvedValue([]); // no row whatsoever

      await expect(
        service.changeProfesor({ groupId: 'g1', newProfesorId: 'newProf', institutionId }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.groups.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when newProfesorId has a UserInstitution row but isActive is false', async () => {
      prisma.groups.findUnique.mockResolvedValue(baseGroup);
      prisma.users.findUnique.mockResolvedValue({ uid: 'newProf', name: 'New' });

      // Distinct setup from the previous test: an actual row exists for this
      // user, just with isActive: false (a baja). The production query
      // filters `isActive: true` server-side, so a mock that just resolves
      // `[]` again would make this test secretly identical to "no row at
      // all". Instead, model a tiny fake table and let the query's `where`
      // do the filtering, so the assertion genuinely exercises the
      // isActive: true clause rather than restating the previous case.
      const fakeRows = [{ userId: 'newProf', institutionId, isActive: false }];
      prisma.userInstitution.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          fakeRows.filter(
            (r) =>
              where.userId.in.includes(r.userId) &&
              r.institutionId === where.institutionId &&
              r.isActive === where.isActive,
          ),
        ),
      );

      await expect(
        service.changeProfesor({ groupId: 'g1', newProfesorId: 'newProf', institutionId }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.groups.update).not.toHaveBeenCalled();
    });

    it('assigns the new profesor when they are an active member of the institution', async () => {
      prisma.groups.findUnique.mockResolvedValue(baseGroup);
      prisma.users.findUnique.mockResolvedValue({ uid: 'newProf', name: 'New' });
      prisma.userInstitution.findMany.mockResolvedValue([{ userId: 'newProf' }]);
      prisma.groups.update.mockResolvedValue({});
      prisma.usersGroups.delete.mockResolvedValue({});
      prisma.usersGroups.create.mockResolvedValue({});

      const result = await service.changeProfesor({
        groupId: 'g1',
        newProfesorId: 'newProf',
        institutionId,
      });

      expect(prisma.groups.update).toHaveBeenCalledWith({
        where: { uid: 'g1' },
        data: { profesorId: 'newProf' },
      });
      expect(prisma.usersGroups.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 'newProf', groupId: 'g1' } }),
      );
      expect(result.profesor).toEqual({ uid: 'newProf', name: 'New' });
    });
  });

  describe('createGroupUseCase (membership guard, profesorId + users[])', () => {
    it('throws ForbiddenException when an initial student uid is not an active member and never opens the transaction', async () => {
      prisma.userInstitution.findMany.mockResolvedValue([]);

      await expect(
        service.createGroupUseCase({
          name: 'Grupo A',
          categoryId: 'cat-1',
          institutionId,
          users: ['outsider'],
          maxGroups: null,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when profesorId is not an active member', async () => {
      prisma.userInstitution.findMany.mockResolvedValue([]);

      await expect(
        service.createGroupUseCase({
          name: 'Grupo A',
          categoryId: 'cat-1',
          institutionId,
          profesorId: 'foreign-profesor',
          maxGroups: null,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates the group and enrolls profesorId + users[] when all are active members', async () => {
      prisma.userInstitution.findMany.mockResolvedValue([
        { userId: 'prof-1' },
        { userId: 'student-1' },
      ]);
      prisma.groups.create.mockResolvedValue({ uid: 'g1' });
      prisma.usersGroups.create.mockResolvedValue({});
      prisma.usersGroups.createMany.mockResolvedValue({ count: 1 });

      const result = await service.createGroupUseCase({
        name: 'Grupo A',
        categoryId: 'cat-1',
        institutionId,
        profesorId: 'prof-1',
        users: ['student-1'],
        maxGroups: null,
      });

      expect(prisma.groups.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Grupo A', profesorId: 'prof-1', institutionId, categoryId: 'cat-1' },
        }),
      );
      expect(prisma.usersGroups.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 'prof-1', groupId: 'g1' } }),
      );
      expect(prisma.usersGroups.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ userId: 'student-1', groupId: 'g1' }] }),
      );
      expect(result).toEqual({ uid: 'g1' });
    });
  });

  // profesorId salió de UpdateGroupUseCase.data en la Task 2: reasignar
  // profesor es PATCH /groups/change-profesor/:uid, así que el escenario que
  // este describe probaba ("update reasigna profesor") ya no existe — con
  // forbidNonWhitelisted el DTO ni deja llegar el campo. uid/contextRole son
  // obligatorios en la interfaz desde la Task 2 pero el servicio todavía no
  // los usa para nada: eso lo cierra la Task 3 (assertCanEditGroup).
  describe('updateGroupUseCase', () => {
    it('actualiza el grupo sin consultar membresía', async () => {
      prisma.groups.findUnique.mockResolvedValue({ uid: 'g1' });
      prisma.groups.update.mockResolvedValue({});

      const result = await service.updateGroupUseCase({
        groupId: 'g1',
        institutionId,
        uid: 'u-cualquiera',
        contextRole: 'coordinator',
        data: { name: 'Nuevo nombre' },
      });

      expect(prisma.userInstitution.findMany).not.toHaveBeenCalled();
      expect(prisma.groups.update).toHaveBeenCalledWith({
        where: { uid: 'g1' },
        data: { name: 'Nuevo nombre' },
      });
      expect(result).toEqual({ uid: 'g1' });
    });
  });
});
