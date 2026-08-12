import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
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

/**
 * Slug de la institución donde viven los artistas independientes.
 * Sus grupos son buckets de publicación, no aulas.
 */
export const PLATFORM_SLUG = 'quyca-platform';

/**
 * Grupos de plataforma gratuitos por usuario. Los grupos de una institución
 * NO cuentan: los paga el plan de esa institución.
 *
 * Cuando exista pasarela de pago, esta constante se reemplaza por el cupo
 * comprado por el usuario. Ver obsidian/Tareas/Ideas Futuras.md § Pasarela de pago.
 */
export const FREE_PLATFORM_GROUPS = 1;

@Injectable()
export class GroupService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /* =========================
   * MEMBERSHIP GUARD
   * `Users`/`UserInstitution` are NOT tenant-scoped models — a userId
   * coming from the client could belong to any institution. Any use
   * case that enrolls a user into a group (profesor or student) must
   * validate membership explicitly before touching `usersGroups`.
   * ========================= */
  private async assertActiveMembers(userIds: string[], institutionId: string) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;

    const members = await this.prisma.userInstitution.findMany({
      where: { userId: { in: unique }, institutionId, isActive: true },
      select: { userId: true },
    });

    const memberIds = new Set(members.map((m) => m.userId));
    const invalid = unique.filter((id) => !memberIds.has(id));

    if (invalid.length) {
      throw new ForbiddenException(
        `User(s) not an active member of this institution: ${invalid.join(', ')}`,
      );
    }
  }

  /* =========================
   * GROUP ACCESS GUARDS
   * Segundo eje de aislamiento. El primero —la institución— lo aplica la
   * extensión de Prisma en cada query y por eso es invisible; éste no existía.
   *
   * Los dos tiran 404 y no 403 cuando el grupo no es tuyo: un 403 confirma que
   * el grupo existe y quién es su gente, que es justo lo que se está tapando.
   * ========================= */

  /** Ver el interior: gestión, o miembro del grupo. */
  private async assertCanViewGroup(groupId: string, uid: string, contextRole: string) {
    if (contextRole === 'rector' || contextRole === 'coordinator') return;

    // UsersGroups es tabla puente sin institutionId y no pasa por la
    // extensión. Acá alcanza porque el groupId ya se validó contra Groups —
    // que sí es scoped — en el propio caso de uso.
    const membership = await this.prisma.usersGroups.findUnique({
      where: { userId_groupId: { userId: uid, groupId } },
      select: { uid: true },
    });

    if (!membership) throw new NotFoundException('Group not found');
  }

  /** Modificar: gestión, o el profesor a cargo. */
  private async assertCanEditGroup(groupId: string, uid: string, contextRole: string) {
    if (contextRole === 'rector' || contextRole === 'coordinator') return;

    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
      select: { profesorId: true },
    });

    if (!group) throw new NotFoundException('Group not found');
    if (group.profesorId !== uid) {
      throw new ForbiddenException('Solo el profesor a cargo puede editar este grupo');
    }
  }

  /* =========================
   * PLAN LIMIT GUARD
   * El tope de grupos del plan. Hasta hoy `maxGroups` solo se mostraba en la
   * pantalla de planes y no lo miraba nadie: era la única palanca de cobro del
   * producto y era decorativa.
   * ========================= */
  private async assertPlanHasRoom(maxGroups: number | null) {
    if (maxGroups === null) return;

    // Groups es scoped: la extensión inyecta el institutionId. Escribirlo a
    // mano acá sería ruido y una pista falsa.
    const current = await this.prisma.groups.count({ where: { isActive: true } });

    if (current >= maxGroups) {
      throw new HttpException(
        `Tu plan permite ${maxGroups} grupos y ya tenés ${current}. Subí de plan para crear más.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /* =========================
   * CREATE
   * ========================= */
  async createGroupUseCase(data: CreateGroupUseCase) {
    const {
      name, profesorId, institutionId, categoryId, users,
      description, rules, coverPhotoId, maxGroups,
    } = data;

    await this.assertPlanHasRoom(maxGroups);

    const idsToValidate = [...(profesorId ? [profesorId] : []), ...(users ?? [])];
    await this.assertActiveMembers(idsToValidate, institutionId);

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Crear grupo
      const group = await tx.groups.create({
        data: {
          name,
          profesorId,
          institutionId,
          categoryId,
          description,
          rules,
          coverPhotoId,
        },
        select: { uid: true },
      });

      // 2️⃣ Profesor como miembro del grupo (si vino)
      if (profesorId) {
        await tx.usersGroups.create({
          data: {
            userId: profesorId,
            groupId: group.uid,
          },
        });
      }

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
    const { page = 1, limit = 10 } = options;

    return this.prisma.groups.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        uid: true,
        name: true,
        // La usa el frontend para la imagen del grupo. Antes mapeaba nombres
        // hardcodeados ('Musica Instrumental', 'Dibujo y pintura') que
        // resolvían undefined para cualquier grupo nuevo.
        groupCategory: { select: { slug: true } },
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
    const { groupId, uid, contextRole, data: updateData } = data;

    await this.assertCanEditGroup(groupId, uid, contextRole);

    // profesorId ya no llega por acá: UpdateGroupDto lo saca a propósito
    // (Task 2). Reasignar profesor es PATCH /groups/change-profesor/:uid.
    await this.prisma.groups.update({
      where: { uid: groupId },
      data: updateData,
    });

    return { uid: groupId };
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
    const { groupId, newProfesorId, institutionId } = data;

    // 1️⃣ Verificar que el grupo existe
    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // 2️⃣ Verificar que el nuevo profesor existe (Users no está scoped;
    // esto solo cubre el caso "no existe en absoluto")
    const newProfesor = await this.prisma.users.findUnique({
      where: { uid: newProfesorId },
      select: { uid: true, name: true },
    });

    if (!newProfesor) {
      throw new NotFoundException('Profesor not found');
    }

    // 3️⃣ Verificar que el nuevo profesor sea miembro activo de esta
    // institución — el chequeo que realmente cierra el límite de tenant
    await this.assertActiveMembers([newProfesorId], institutionId);

    return this.prisma.$transaction(async (tx) => {
      const oldProfesorId = group.profesorId;

      // 4️⃣ Actualizar el profesor del grupo
      await tx.groups.update({
        where: { uid: groupId },
        data: { profesorId: newProfesorId },
      });

      // 5️⃣ Eliminar al antiguo profesor como miembro (si no es el mismo)
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

      // 6️⃣ Agregar al nuevo profesor como miembro (si no está ya)
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

  /* =========================
   * GET MY GROUPS
   * ========================= */

  /**
   * Grupos del usuario dentro de la institución activa.
   *
   * UsersGroups es tabla puente: no tiene institutionId y no pasa por la
   * extensión. El `group` anidado SÍ es modelo scoped, pero la extensión
   * intercepta la operación de nivel superior (usersGroups.findMany) — no
   * filtra un `select`/`include` anidado hacia Groups. Verificado en vivo
   * (Task 6B): sin el filtro explícito de abajo, un usuario miembro de dos
   * instituciones recibía en una sola respuesta los grupos de ambas, sin
   * importar qué institución pedía el header X-Institution-Slug. Por eso acá
   * el institutionId va explícito, tomado del tenant activo resuelto por
   * TenantGuard (ver obsidian/errors/multitenant/2026-08-07-la-extension-no-filtra-relaciones-anidadas).
   */
  async getMyGroups(userId: string, institutionId: string) {
    const rows = await this.prisma.usersGroups.findMany({
      where: { userId, group: { institutionId } },
      select: { group: { select: { uid: true, name: true } } },
    });

    // Se aplana: al caller le importan los grupos, no las filas puente.
    return rows.map((r) => r.group);
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
    const { userId, groupIds, institutionId } = data;

    // Validar que existan los grupos (ya scoped automáticamente al tenant activo)
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

    // Validar que el usuario sea miembro activo de esta institución
    await this.assertActiveMembers([userId], institutionId);

    // Límite de grupos gratuitos, solo dentro de quyca-platform.
    // Institution es modelo bootstrap: no pasa por la extensión, el filtro va explícito.
    const platform = await this.prisma.institution.findUnique({
      where: { slug: PLATFORM_SLUG },
      select: { uid: true },
    });

    if (platform && institutionId === platform.uid) {
      // UsersGroups es tabla puente y no lleva institutionId: se acota por la
      // relación al grupo, que sí lo tiene.
      const current = await this.prisma.usersGroups.count({
        where: { userId, group: { institutionId: platform.uid } },
      });

      if (current + groupIds.length > FREE_PLATFORM_GROUPS) {
        throw new HttpException(
          `Ya tenés ${FREE_PLATFORM_GROUPS} grupo de Quyca. Sumar más grupos requiere un plan pago.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
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
  async getAllStudentsByGroup(groupId: string, uid: string, contextRole: string) {
    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    await this.assertCanViewGroup(groupId, uid, contextRole);

    const userTypeId = this.configService.get<string>('config.roles.user');

    return this.prisma.usersGroups.findMany({
      where: {
        groupId,
        user: { userTypeId },
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
    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return this.prisma.usersGroups.deleteMany({
      where: { groupId },
    });
  }

  /* =========================
   * DELETE ONE STUDENT BY GROUP
   * ========================= */
  async deleteOneStudentByGroup(data: DeleteStudentByGroupUseCase) {
    const { groupId, userId, uid, contextRole } = data;

    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    await this.assertCanEditGroup(groupId, uid, contextRole);

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
    const { groupId, users, institutionId, uid, contextRole } = data;

    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    await this.assertCanEditGroup(groupId, uid, contextRole);

    await this.assertActiveMembers(users, institutionId);

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
