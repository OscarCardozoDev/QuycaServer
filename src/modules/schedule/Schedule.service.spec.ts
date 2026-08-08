import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleService } from './Schedule.service';
import { PrismaService } from 'src/prisma/prisma.service';

// Helpers
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function buildTxMock(capturedDates: Date[]) {
  return {
    schedule: {
      create: jest.fn().mockResolvedValue({ uid: 'sched-1' }),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    classes: {
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: { date: Date }[] }) => {
          capturedDates.push(...data.map((d) => d.date));
          return Promise.resolve({ count: data.length });
        }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
    },
    attendance: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

const mockConfig = { get: jest.fn() };
const mockPrisma = {
  $transaction: jest.fn(),
  schedule: { findMany: jest.fn(), update: jest.fn() },
  groups: { findUnique: jest.fn() },
};

describe('ScheduleService - session generation', () => {
  let service: ScheduleService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(ScheduleService);
    jest.clearAllMocks();
    // Default: groupId belongs to the active tenant. Overridden by the
    // FK-guard describe block below.
    mockPrisma.groups.findUnique.mockResolvedValue({ uid: 'g-1' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('generates sessions only on the requested day of week', async () => {
    // April 24, 2026 is Friday (5). Request Monday (1).
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-24T08:00:00'));
    mockConfig.get.mockReturnValue('2026-05-15');

    const dates: Date[] = [];
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: ReturnType<typeof buildTxMock>) => Promise<unknown>) =>
        fn(buildTxMock(dates)),
    );

    await service.create({
      groupId: 'g-1',
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '11:00',
      institutionId: 'inst-1',
    });

    expect(dates.length).toBeGreaterThan(0);
    dates.forEach((date) => {
      expect(date.getDay()).toBe(1);
    });
  });

  it('generates sessions with exactly 7-day intervals', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-24T08:00:00')); // Friday
    mockConfig.get.mockReturnValue('2026-05-22');

    const dates: Date[] = [];
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: ReturnType<typeof buildTxMock>) => Promise<unknown>) =>
        fn(buildTxMock(dates)),
    );

    await service.create({
      groupId: 'g-1',
      dayOfWeek: 5,
      startTime: '10:00',
      endTime: '11:00',
      institutionId: 'inst-1',
    });

    expect(dates.length).toBeGreaterThan(1);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime() - dates[i - 1].getTime()).toBe(MS_PER_WEEK);
    }
  });

  it('does not generate sessions past semester end date', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-24T08:00:00')); // Friday
    const semesterEnd = new Date('2026-05-08');
    mockConfig.get.mockReturnValue('2026-05-08');

    const dates: Date[] = [];
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: ReturnType<typeof buildTxMock>) => Promise<unknown>) =>
        fn(buildTxMock(dates)),
    );

    await service.create({
      groupId: 'g-1',
      dayOfWeek: 5,
      startTime: '10:00',
      endTime: '11:00',
      institutionId: 'inst-1',
    });

    dates.forEach((date) => {
      expect(date.getTime()).toBeLessThanOrEqual(semesterEnd.getTime());
    });
  });

  it('starts sessions from today when today matches the requested day', async () => {
    // April 24, 2026 is Friday (5)
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-24T08:00:00'));
    mockConfig.get.mockReturnValue('2026-04-30');

    const dates: Date[] = [];
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: ReturnType<typeof buildTxMock>) => Promise<unknown>) =>
        fn(buildTxMock(dates)),
    );

    await service.create({
      groupId: 'g-1',
      dayOfWeek: 5,
      startTime: '10:00',
      endTime: '11:00',
      institutionId: 'inst-1',
    });

    const firstDate = dates[0];
    // First session must be today (April 24), not next Friday
    expect(firstDate.getFullYear()).toBe(2026);
    expect(firstDate.getMonth()).toBe(3); // April = 3 (0-indexed)
    expect(firstDate.getDate()).toBe(24);
  });

  it('creates no sessions when semester end date is in the past', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-24T08:00:00'));
    mockConfig.get.mockReturnValue('2026-04-20'); // already past

    const dates: Date[] = [];
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: ReturnType<typeof buildTxMock>) => Promise<unknown>) =>
        fn(buildTxMock(dates)),
    );

    await service.create({
      groupId: 'g-1',
      dayOfWeek: 5,
      startTime: '10:00',
      endTime: '11:00',
      institutionId: 'inst-1',
    });

    expect(dates).toHaveLength(0);
  });
});

// ─── create (FK guard — groupId must belong to the active tenant) ─────────────
//
// `groupId` is a direct FK on `Schedule`/`Classes`, not filtered by the
// tenant extension on nested reads. `groups.findUnique` IS scoped, so a
// foreign groupId resolves to null and must block the write before any
// Schedule/Classes rows are created.

describe('ScheduleService - groupId tenant guard', () => {
  let service: ScheduleService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(ScheduleService);
    jest.clearAllMocks();
  });

  it('throws NotFoundException for a groupId outside the active tenant and writes nothing', async () => {
    mockPrisma.groups.findUnique.mockResolvedValue(null); // extension scoped it out

    await expect(
      service.create({
        groupId: 'foreign-group',
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '11:00',
        institutionId: 'inst-1',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
