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
