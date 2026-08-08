import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClassesService } from './Classes.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockPrisma = {
  classes: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  usersGroups: { findFirst: jest.fn() },
  attendance: { create: jest.fn(), findMany: jest.fn() },
  groups: { findUnique: jest.fn() },
};

// Local-time constructor avoids UTC-offset shifting the date to the wrong day
const CLASS_TODAY = {
  uid: 'class-1',
  groupId: 'group-1',
  startTime: '10:00',
  endTime: '11:00',
  date: new Date(2026, 3, 24, 0, 0, 0), // April 24 local time
};

describe('ClassesService', () => {
  let service: ClassesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ClassesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(ClassesService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── create (FK guard — groupId must belong to the active tenant) ───────────
  //
  // `groupId` is a direct FK on `Classes`, not filtered by the tenant
  // extension on nested reads. `groups.findUnique` IS scoped, so a foreign
  // groupId resolves to null and must block the write before any Classes
  // row (which would otherwise be correctly stamped with the caller's own
  // institutionId, but point at a foreign group) is created.

  describe('create', () => {
    const params = {
      groupId: 'group-1',
      date: new Date(2026, 3, 24, 0, 0, 0),
      startTime: '10:00',
      endTime: '11:00',
      institutionId: 'inst-1',
    };

    it('throws NotFoundException for a groupId outside the active tenant and writes nothing', async () => {
      mockPrisma.groups.findUnique.mockResolvedValue(null); // extension scoped it out

      await expect(service.create(params)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.classes.create).not.toHaveBeenCalled();
    });

    it('creates the class when the group belongs to the active tenant', async () => {
      mockPrisma.groups.findUnique.mockResolvedValue({ uid: 'group-1' });
      mockPrisma.classes.create.mockResolvedValue({ uid: 'class-new' });

      const result = await service.create(params);

      expect(result).toEqual({ uid: 'class-new' });
      expect(mockPrisma.classes.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-1',
          date: params.date,
          startTime: '10:00',
          endTime: '11:00',
          topic: undefined,
          scheduleId: null,
          institutionId: 'inst-1',
        },
        select: { uid: true },
      });
    });
  });

  // ─── getByGroup (read-side guard) ────────────────────────────────────────────
  //
  // The tenant extension only rewrites the top-level `where` of the call it
  // intercepts — it does NOT scope the nested `group: {...}` relation that
  // `getByGroup` selects. Without the explicit `groups.findUnique` check, a
  // foreign groupId planted on a Classes row (see the `create` guard above)
  // would leak that foreign group's name/category/professor through the
  // nested select. A foreign groupId must return an empty list instead.

  describe('getByGroup', () => {
    it('returns nothing for a groupId outside the active tenant, without leaking the nested relation', async () => {
      mockPrisma.groups.findUnique.mockResolvedValue(null); // extension scoped it out

      const result = await service.getByGroup('foreign-group');

      expect(result).toEqual([]);
      expect(mockPrisma.classes.findMany).not.toHaveBeenCalled();
    });

    it('returns the classes when the group belongs to the active tenant', async () => {
      mockPrisma.groups.findUnique.mockResolvedValue({ uid: 'group-1' });
      mockPrisma.classes.findMany.mockResolvedValue([CLASS_TODAY]);

      const result = await service.getByGroup('group-1');

      expect(result).toEqual([CLASS_TODAY]);
      expect(mockPrisma.classes.findMany).toHaveBeenCalled();
    });
  });

  // ─── getCurrentClass ────────────────────────────────────────────────────────

  describe('getCurrentClass', () => {
    it('returns active class when current time is within window', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T15:30:00Z'));
      mockPrisma.classes.findMany.mockResolvedValue([CLASS_TODAY]);

      const result = await service.getCurrentClass('group-1');

      expect(result).toEqual({ active: true, classId: 'class-1' });
    });

    it('returns inactive when current time is before class window', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T14:59:00Z'));
      mockPrisma.classes.findMany.mockResolvedValue([CLASS_TODAY]);

      const result = await service.getCurrentClass('group-1');

      expect(result).toEqual({ active: false });
    });

    it('returns inactive when current time is after class window', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T16:01:00Z'));
      mockPrisma.classes.findMany.mockResolvedValue([CLASS_TODAY]);

      const result = await service.getCurrentClass('group-1');

      expect(result).toEqual({ active: false });
    });

    it('returns inactive when no classes exist today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T15:30:00Z'));
      mockPrisma.classes.findMany.mockResolvedValue([]);

      const result = await service.getCurrentClass('group-1');

      expect(result).toEqual({ active: false });
    });

    it('returns first active class when multiple classes today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T19:30:00Z'));
      mockPrisma.classes.findMany.mockResolvedValue([
        { ...CLASS_TODAY, uid: 'class-morning', startTime: '10:00', endTime: '11:00' },
        { ...CLASS_TODAY, uid: 'class-afternoon', startTime: '14:00', endTime: '16:00' },
      ]);

      const result = await service.getCurrentClass('group-1');

      expect(result).toEqual({ active: true, classId: 'class-afternoon' });
    });
  });

  // ─── attend ─────────────────────────────────────────────────────────────────

  describe('attend', () => {
    const params = { classId: 'class-1', userId: 'user-1', institutionId: 'inst-1' };

    it('throws NotFoundException when class does not exist', async () => {
      mockPrisma.classes.findUnique.mockResolvedValue(null);

      await expect(service.attend(params)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when class is not today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T15:30:00Z'));
      mockPrisma.classes.findUnique.mockResolvedValue({
        ...CLASS_TODAY,
        date: new Date(2026, 3, 23, 0, 0, 0), // yesterday, local time
      });

      await expect(service.attend(params)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when class is today but outside time window', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T17:00:00Z'));
      mockPrisma.classes.findUnique.mockResolvedValue(CLASS_TODAY);

      await expect(service.attend(params)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user is not in the group', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T15:30:00Z'));
      mockPrisma.classes.findUnique.mockResolvedValue(CLASS_TODAY);
      mockPrisma.usersGroups.findFirst.mockResolvedValue(null);

      await expect(service.attend(params)).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException on duplicate attendance (P2002)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T15:30:00Z'));
      mockPrisma.classes.findUnique.mockResolvedValue(CLASS_TODAY);
      mockPrisma.usersGroups.findFirst.mockResolvedValue({ uid: 'ug-1' });
      mockPrisma.attendance.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.attend(params)).rejects.toThrow(ConflictException);
    });

    it('returns success when all conditions are met', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T15:30:00Z'));
      mockPrisma.classes.findUnique.mockResolvedValue(CLASS_TODAY);
      mockPrisma.usersGroups.findFirst.mockResolvedValue({ uid: 'ug-1' });
      mockPrisma.attendance.create.mockResolvedValue({ uid: 'att-1' });

      const result = await service.attend(params);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.attendance.create).toHaveBeenCalledWith({
        data: { classId: 'class-1', userId: 'user-1', institutionId: 'inst-1' },
      });
    });
  });
});
