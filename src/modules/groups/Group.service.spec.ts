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
      groups: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      usersGroups: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        delete: jest.fn(),
      },
      users: { findUnique: jest.fn() },
      userInstitution: { findMany: jest.fn() },
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

  describe('createGroupUseCase (membership guard, profesorId + users[])', () => {
    it('throws ForbiddenException when an initial student uid is not an active member and never opens the transaction', async () => {
      prisma.userInstitution.findMany.mockResolvedValue([]);

      await expect(
        service.createGroupUseCase({
          name: 'Grupo A',
          categoryId: 'cat-1',
          institutionId,
          users: ['outsider'],
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
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
