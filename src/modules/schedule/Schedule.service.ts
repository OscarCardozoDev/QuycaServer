import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import type { CreateScheduleUseCase, UpdateScheduleUseCase } from './Schedule.interface';

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getSemesterEndDate(): Date {
    const raw = this.config.get<string>('config.semesterEndDate');
    return raw ? new Date(raw) : new Date(new Date().getFullYear(), 11, 15);
  }

  private generateSessionDates(dayOfWeek: number): Date[] {
    const semesterEnd = this.getSemesterEndDate();
    const dates: Date[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const current = new Date(today);
    while (current.getDay() !== dayOfWeek) {
      current.setDate(current.getDate() + 1);
    }

    while (current <= semesterEnd) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    return dates;
  }

  async create(data: CreateScheduleUseCase) {
    const { groupId, dayOfWeek, startTime, endTime, institutionId } = data;

    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.create({
        data: { groupId, dayOfWeek, startTime, endTime, institutionId },
        select: { uid: true },
      });

      const dates = this.generateSessionDates(dayOfWeek);

      if (dates.length > 0) {
        await tx.classes.createMany({
          data: dates.map((date) => ({
            groupId,
            scheduleId: schedule.uid,
            date,
            startTime,
            endTime,
            institutionId,
          })),
        });
      }

      return schedule;
    });
  }

  async getByGroup(groupId: string) {
    return this.prisma.schedule.findMany({
      where: { groupId, isActive: true },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async update({ scheduleId, data, institutionId }: UpdateScheduleUseCase) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.schedule.findUniqueOrThrow({
        where: { uid: scheduleId },
      });

      const updated = await tx.schedule.update({
        where: { uid: scheduleId },
        data,
        select: { uid: true, groupId: true, dayOfWeek: true, startTime: true, endTime: true },
      });

      const futureClasses = await tx.classes.findMany({
        where: { scheduleId, date: { gte: new Date() }, isActive: true },
        select: { uid: true },
      });

      const futureIds = futureClasses.map((c) => c.uid);

      if (futureIds.length > 0) {
        const attended = await tx.attendance.findMany({
          where: { classId: { in: futureIds } },
          select: { classId: true },
        });
        const attendedIds = new Set(attended.map((a) => a.classId));
        const toDelete = futureIds.filter((id) => !attendedIds.has(id));

        if (toDelete.length > 0) {
          await tx.classes.deleteMany({ where: { uid: { in: toDelete } } });
        }
      }

      const dayOfWeek = data.dayOfWeek ?? current.dayOfWeek;
      const startTime = data.startTime ?? current.startTime;
      const endTime = data.endTime ?? current.endTime;
      const dates = this.generateSessionDates(dayOfWeek);

      if (dates.length > 0) {
        await tx.classes.createMany({
          data: dates.map((date) => ({
            groupId: updated.groupId,
            scheduleId,
            date,
            startTime,
            endTime,
            institutionId,
          })),
          skipDuplicates: true,
        });
      }

      return updated;
    });
  }

  async remove(scheduleId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.schedule.update({
        where: { uid: scheduleId },
        data: { isActive: false },
      });

      const futureClasses = await tx.classes.findMany({
        where: { scheduleId, date: { gte: new Date() }, isActive: true },
        select: { uid: true },
      });

      const futureIds = futureClasses.map((c) => c.uid);

      if (futureIds.length > 0) {
        const attended = await tx.attendance.findMany({
          where: { classId: { in: futureIds } },
          select: { classId: true },
        });
        const attendedIds = new Set(attended.map((a) => a.classId));
        const toDelete = futureIds.filter((id) => !attendedIds.has(id));

        if (toDelete.length > 0) {
          await tx.classes.deleteMany({ where: { uid: { in: toDelete } } });
        }
      }

      return { success: true };
    });
  }
}
