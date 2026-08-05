import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  CreateClassUseCase,
  UpdateTopicUseCase,
  AttendUseCase,
  CurrentClassResult,
} from './Classes.interface';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private getCurrentTimeStr(): string {
    return new Date().toLocaleTimeString('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  private getTodayRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
    );
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );
    return { start, end };
  }

  async getByGroup(groupId: string, from?: string, to?: string) {
    const where: Record<string, unknown> = { groupId, isActive: true };

    if (from || to) {
      where.date = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    return this.prisma.classes.findMany({
      where,
      orderBy: { date: 'asc' },
      select: {
        uid: true,
        date: true,
        startTime: true,
        endTime: true,
        topic: true,
        review: true,
        groupId: true,
        scheduleId: true,
        group: {
          select: {
            name: true,
            categoryId: true,
            profesor: {
              select: { uid: true, name: true, lastName: true },
            },
          },
        },
      },
    });
  }

  async create(data: CreateClassUseCase) {
    return this.prisma.classes.create({
      data: {
        groupId: data.groupId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        topic: data.topic,
        scheduleId: null,
      },
      select: { uid: true },
    });
  }

  async updateTopic({ classId, topic, review }: UpdateTopicUseCase) {
    return this.prisma.classes.update({
      where: { uid: classId },
      data: { topic, review },
      select: { uid: true, topic: true, review: true },
    });
  }

  async getAttendance(classId: string) {
    const cls = await this.prisma.classes.findUnique({
      where: { uid: classId },
    });
    if (!cls) throw new NotFoundException('Class not found');

    return this.prisma.attendance.findMany({
      where: { classId },
      select: {
        uid: true,
        takenAt: true,
        user: {
          select: { uid: true, name: true, lastName: true, username: true },
        },
      },
      orderBy: { takenAt: 'asc' },
    });
  }

  async getCurrentClass(groupId: string): Promise<CurrentClassResult> {
    const { start, end } = this.getTodayRange();
    const currentTime = this.getCurrentTimeStr();

    const classes = await this.prisma.classes.findMany({
      where: { groupId, isActive: true, date: { gte: start, lte: end } },
      select: { uid: true, startTime: true, endTime: true },
    });

    const active = classes.find(
      (c) => currentTime >= c.startTime && currentTime <= c.endTime,
    );

    return active ? { active: true, classId: active.uid } : { active: false };
  }

  async attend({ classId, userId }: AttendUseCase) {
    const cls = await this.prisma.classes.findUnique({
      where: { uid: classId },
      select: {
        uid: true,
        groupId: true,
        startTime: true,
        endTime: true,
        date: true,
      },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const { start, end } = this.getTodayRange();
    const currentTime = this.getCurrentTimeStr();
    const classDate = new Date(cls.date);
    const isToday = classDate >= start && classDate <= end;
    const isNow = currentTime >= cls.startTime && currentTime <= cls.endTime;

    if (!isToday || !isNow) {
      throw new ForbiddenException('No active class at this time');
    }

    const membership = await this.prisma.usersGroups.findFirst({
      where: { userId, groupId: cls.groupId },
    });
    if (!membership) throw new ForbiddenException('User not in this group');

    try {
      await this.prisma.attendance.create({ data: { classId, userId } });
      return { success: true };
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('Attendance already registered');
      }
      throw e;
    }
  }
}
