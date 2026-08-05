import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateGroupUseCase,
  UpdateGroupUseCase,
  GetGroupsOptions,
  AddStudentToGroupUseCase,
  UpdateStudentsByGroupUseCase,
  DeleteStudentByGroupUseCase,
  AddStudentToGroupsUseCase,
  ChangeProfesorUseCase,
} from './Group.interface';

@Injectable()
export class GroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /* =========================
   * CREATE
   * ========================= */
  async createGroupUseCase(data: CreateGroupUseCase) {
    const { name, profesorId, institutionId, categoryId, users } = data;

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Crear grupo
      const group = await tx.groups.create({
        data: {
          name,
          profesorId,
          institutionId,
          categoryId,
        },
        select: { uid: true },
      });

      // 2️⃣ Profesor como miembro del grupo
      await tx.usersGroups.create({
        data: {
          userId: profesorId,
          groupId: group.uid,
        },
      });

      // 3️⃣ Usuarios iniciales
      if (users?.length) {
        await tx.usersGroups.createMany({
          data: users.map((userId) => ({
            userId,
            groupId: group.uid,
          })),
          skipDuplicates: true,
        });
      }

      return group;
    });
  }

  /* =========================
   * GET ALL
   * ========================= */
  async getAll(options: GetGroupsOptions = {}) {
    const { page = 1, limit = 10, institutionId } = options;

    return this.prisma.groups.findMany({
      where: institutionId ? { institutionId } : undefined,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        uid: true,
        name: true,
      },
    });
  }

  /* =========================
   * GET BY ID
   * ========================= */
  async getById(groupId: string) {
    return this.prisma.groups.findUnique({
      where: { uid: groupId },
      include: {
        profesor: {
          select: { uid: true, name: true },
        },
        users: {
          select: {
            user: { select: { uid: true, name: true } },
          },
        },
      },
    });
  }

  /* =========================
   * UPDATE
   * ========================= */
  async updateGroupUseCase(data: UpdateGroupUseCase) {
    const { groupId, data: updateData } = data;

    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Update grupo
      await tx.groups.update({
        where: { uid: groupId },
        data: updateData,
      });

      return { uid: groupId };
    });
  }

  /* =========================
   * DELETE
   * ========================= */
  async deleteGroup(groupId: string) {
    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    await this.prisma.groups.delete({
      where: { uid: groupId },
    });

    return true;
  }

  /* =========================
   * CHANGE PROFESOR
   * ========================= */
  async changeProfesor(data: ChangeProfesorUseCase) {
    const { groupId, newProfesorId } = data;

    // 1️⃣ Verificar que el grupo existe
    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // 2️⃣ Verificar que el nuevo profesor existe
    const newProfesor = await this.prisma.users.findUnique({
      where: { uid: newProfesorId },
      select: { uid: true, name: true },
    });

    if (!newProfesor) {
      throw new NotFoundException('Profesor not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const oldProfesorId = group.profesorId;

      // 3️⃣ Actualizar el profesor del grupo
      await tx.groups.update({
        where: { uid: groupId },
        data: { profesorId: newProfesorId },
      });

      // 4️⃣ Eliminar al antiguo profesor como miembro (si no es el mismo)
      if (oldProfesorId && oldProfesorId !== newProfesorId) {
        await tx.usersGroups
          .delete({
            where: {
              userId_groupId: {
                userId: oldProfesorId,
                groupId,
              },
            },
          })
          .catch(() => {
            // Si no existía la relación, ignoramos el error
          });
      }

      // 5️⃣ Agregar al nuevo profesor como miembro (si no está ya)
      await tx.usersGroups
        .create({
          data: {
            userId: newProfesorId,
            groupId,
          },
        })
        .catch(() => {
          // Si ya era miembro, no pasa nada
        });

      return {
        groupId,
        profesor: newProfesor,
      };
    });
  }

  /* --------------------------------------- Student Uses Cases For Groups --------------------------------------- */

  /* =========================
   * ADD NEW STUDENT
   * ========================= */
  async addNewStudent(data: AddStudentToGroupUseCase) {
    const { groupId, userId } = data;

    // Verificar grupo
    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    try {
      return await this.prisma.usersGroups.create({
        data: {
          groupId,
          userId,
        },
        select: { uid: true },
      });
    } catch {
      throw new ConflictException('User already belongs to this group');
    }
  }

  /* =========================
   * ADD NEW STUDENT TO DIFFERENT GROUPS
   * ========================= */

  async addStudentToGroups(data: AddStudentToGroupsUseCase) {
    const { userId, groupIds } = data;

    // Validar que existan los grupos
    const groups = await this.prisma.groups.findMany({
      where: { uid: { in: groupIds } },
      select: { uid: true },
    });

    if (groups.length !== groupIds.length) {
      const foundIds = groups.map((g) => g.uid);
      const missing = groupIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(`Groups not found: ${missing.join(', ')}`);
    }

    // Validar que exista el usuario
    const user = await this.prisma.users.findUnique({
      where: { uid: userId },
      select: { uid: true },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    // Intentar agregar a todos los grupos
    const results = await Promise.allSettled(
      groupIds.map((groupId) =>
        this.prisma.usersGroups.create({
          data: { groupId, userId },
          select: { uid: true, groupId: true },
        }),
      ),
    );

    // Separar éxitos y fallos
    const created = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value);

    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r, index) => ({
        groupId: groupIds[index],
        reason: 'Already belongs to this group',
      }));

    return {
      success: true,
      userId,
      created: created.length,
      failed: failed.length,
      details: {
        created,
        failed,
      },
    };
  }

  /* =========================
   * GET ALL STUDENTS BY GROUP
   * ========================= */
  async getAllStudentsByGroup(groupId: string) {
    const studentTypeId = this.configService.get<string>(
      'config.roles.student',
    );

    return this.prisma.usersGroups.findMany({
      where: {
        groupId,
        user: { userTypeId: studentTypeId },
      },
      select: {
        user: {
          select: {
            uid: true,
            name: true,
            lastName: true,
          },
        },
      },
    });
  }

  /* =========================
   * DELETE ALL STUDENTS BY GROUP
   * ========================= */
  async deleteStudentsByGroup(groupId: string) {
    return this.prisma.usersGroups.deleteMany({
      where: { groupId },
    });
  }

  /* =========================
   * DELETE ONE STUDENT BY GROUP
   * ========================= */
  async deleteOneStudentByGroup(data: DeleteStudentByGroupUseCase) {
    const { groupId, userId } = data;

    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.usersGroups.delete({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
      });
    });
  }

  /* =========================
   * UPDATE STUDENTS BY GROUP
   * ========================= */
  async updateStudentsByGroup(data: UpdateStudentsByGroupUseCase) {
    const { groupId, users } = data;

    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Eliminar relaciones actuales
      await tx.usersGroups.deleteMany({
        where: { groupId },
      });

      // Crear nuevas
      if (users.length) {
        await tx.usersGroups.createMany({
          data: users.map((userId) => ({
            userId,
            groupId,
          })),
          skipDuplicates: true,
        });
      }

      return { groupId };
    });
  }
}
