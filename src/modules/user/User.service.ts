// server/src/modules/user/User.service.ts
import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PhotosService } from 'src/modules/photos/Photos.service';
import { runWithoutTenant } from 'src/tenant/tenant-context';
import {
  validateRoleData,
  sanitizeRoleData,
} from 'src/utils/role-data.validator';
import {
  CreateStudentUseCase,
  UserWithRelations,
  UserUidResult,
  AuthorInfo,
} from './User.interface';
import { UpdateUserDto } from './User.dto';

const USER_SELECT = {
  uid: true,
  name: true,
  lastName: true,
  username: true,
  description: true,
  gender: true,
  telNumber: true,
  isActive: true,
  userTypeId: true,
  photoId: true,
  roleId: true,
  roleData: true,
  userType: { select: { uid: true, name: true } },
  photo: { select: { uid: true, url: true } },
  role: { select: { uid: true, name: true, slug: true } },
  groups: { select: { group: { select: { uid: true, name: true } } } },
} as const;

@Injectable()
export class UserService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    private readonly photosService: PhotosService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Usuarios activos de una institución, con el rol que tienen EN ESA
   * institución.
   *
   * `Users` no tiene tenant a propósito: una misma persona puede ser profesor
   * en una institución y estudiante en otra. El rol vive entonces en
   * `UserInstitution.contextRole`, no en `Users`. Sin este dato en la
   * respuesta, un profesor que acepta una invitación es indistinguible de un
   * artista autodidacta — la membresía se crea con `contextRole:
   * 'institutional'`, pero nadie del lado del cliente puede verlo.
   *
   * El `where` anidado no es decorativo: acota la membresía a la institución
   * que se está consultando. Sin él se filtrarían las membresías del usuario
   * en OTRAS instituciones, que es justamente lo que el aislamiento evita.
   * `UserInstitution` no pasa por la extensión de Prisma (es un modelo de
   * bootstrap), así que acá el filtro es explícito y obligatorio.
   */
  async getActiveUsers(institutionId: string): Promise<UserWithRelations[]> {
    return this.prismaService.users.findMany({
      where: {
        isActive: true,
        userInstitutions: { some: { institutionId, isActive: true } },
      },
      select: {
        ...USER_SELECT,
        userInstitutions: {
          where: { institutionId, isActive: true },
          select: { contextRole: true, joinedAt: true },
        },
      },
    });
  }

  async getUser(uid: string): Promise<UserWithRelations> {
    const user = await this.prismaService.users.findUnique({
      where: { uid },
      select: USER_SELECT,
    });

    if (!user) throw new NotFoundException(`User not found`);
    return user;
  }

  async getMe(uid: string) {
    const user = await this.prismaService.users.findUnique({
      where: { uid },
      select: {
        ...USER_SELECT,
        userInstitutions: {
          select: {
            contextRole: true,
            institution: { select: { uid: true, slug: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException(`User not found`);
    return user;
  }

  /**
   * Perfil público del autor — GET /user/author/:uid, sin guards.
   *
   * `Groups` es un modelo scoped. `Users` no lo es, así que este `findUnique`
   * nunca pasaría por la extensión de tenant de por sí — pero la relación
   * anidada hacia `Groups` sí es del tipo de dato que la extensión filtra en
   * las consultas directas. La extensión NO intercepta relaciones anidadas
   * (ver obsidian/errors/multitenant/2026-08-07-la-extension-no-filtra-
   * relaciones-anidadas.md), así que esto funcionaría igual sin el bypass.
   * Envolvemos en runWithoutTenant() de todos modos: es la forma explícita de
   * decir "este dato es público a propósito", en vez de apoyarnos en un
   * agujero de la extensión que se cierra el día que entre RLS.
   */
  async getInfoAuthor(uid: string): Promise<AuthorInfo> {
    const user = await runWithoutTenant(() =>
      this.prismaService.users.findUnique({
        where: { uid },
        select: {
          uid: true,
          name: true,
          lastName: true,
          username: true,
          description: true,
          photoId: true,
          photo: { select: { uid: true, url: true } },
          // Puente hacia Groups. Solo lo público de un grupo cerrado: nombre,
          // portada, descripción, categoría e institución. NUNCA `users` ni
          // `_count.users` acá — quién está adentro de un grupo no se publica.
          groups: {
            where: { group: { isActive: true } },
            select: {
              group: {
                select: {
                  uid: true,
                  name: true,
                  description: true,
                  coverPhoto: { select: { url: true } },
                  groupCategory: { select: { name: true, slug: true } },
                  institution: { select: { name: true, slug: true } },
                },
              },
            },
          },
        },
      }),
    );

    if (!user) throw new NotFoundException(`User with uid ${uid} not found`);

    const { groups, ...rest } = user;
    return { ...rest, groups: groups.map((ug) => ug.group) };
  }

  async createStudentUseCase(
    data: CreateStudentUseCase,
  ): Promise<UserUidResult> {
    const { uid, user, photo } = data;

    const userTypeId = this.configService.get<string>('config.roles.user');
    if (!userTypeId) throw new BadRequestException('User type not configured');

    // The role is resolved server-side, never taken from the client. Self-
    // registration (this endpoint) can only ever produce a 'self-taught'
    // member of quyca-platform — institution-affiliated roles (rector,
    // coordinator, institutional, independent) only ever arrive through
    // POST /institutions or an invitation, both of which set contextRole
    // themselves. Letting a caller pick any Roles row by uid (the previous
    // behavior) let a plain registrant grant themselves 'rector' — see
    // Task 11 report, fix round 5.
    const role = await this.prismaService.roles.findUnique({
      where: { slug: 'self-taught' },
      select: { uid: true, slug: true },
    });
    if (!role) {
      throw new BadRequestException(
        'Role "self-taught" not found — run prisma:seed:static',
      );
    }

    const validation = validateRoleData(role.slug, user.roleData);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join('; '));
    }
    const sanitized = sanitizeRoleData(role.slug, user.roleData);

    const platform = await this.prismaService.institution.findUnique({
      where: { slug: 'quyca-platform' },
      select: { uid: true },
    });
    if (!platform) {
      throw new BadRequestException(
        'Institution "quyca-platform" not found — run prisma:seed:static',
      );
    }

    let photoResult: { uid: string } | null = null;
    if (photo) {
      const created = await this.photosService.createPhotoUseCase(photo);
      photoResult = { uid: created.uid };
    }

    try {
      return await this.prismaService.$transaction(async (tx) => {
        const created = await tx.users.create({
          data: {
            uid,
            name: user.name,
            lastName: user.lastName,
            username: user.username,
            description: user.description,
            gender: user.gender,
            telNumber: user.telNumber,
            userType: { connect: { uid: userTypeId } },
            role: { connect: { uid: role.uid } },
            roleData: sanitized,
            ...(photoResult && {
              photo: { connect: { uid: photoResult.uid } },
            }),
          },
          select: { uid: true },
        });

        await tx.userInstitution.create({
          data: {
            userId: created.uid,
            institutionId: platform.uid,
            contextRole: role.slug,
          },
        });

        return { uid: created.uid, ...(photoResult && { photo: photoResult }) };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('username or uid already in use');
      }
      throw e;
    }
  }

  // Guards the five endpoints where a caller (a rector/coordinator acting
  // with institution-level authority) supplies an arbitrary target uid.
  // Throws NotFoundException, not ForbiddenException: a caller must not be
  // able to distinguish "doesn't exist" from "exists in another
  // institution" by probing uids. institutionId always comes from the
  // verified active membership set by TenantGuard (@Institution()), never
  // from the request body/params.
  private async assertMemberOfInstitution(
    userId: string,
    institutionId: string,
  ): Promise<void> {
    const membership = await this.prismaService.userInstitution.findFirst({
      where: { userId, institutionId, isActive: true },
    });
    if (!membership) throw new NotFoundException('User not found');
  }

  // ─── updateUser: self-service vs. administrative ──────────────────────
  //
  // Split into two named methods rather than one method with an optional
  // institutionId. An optional parameter is opt-in: nothing stops a future
  // call site from omitting it and silently skipping the tenant check —
  // exactly the failure mode that already bit this project five times in
  // groups and six more in events (caller discipline, not the type system,
  // was the only thing enforcing scoping). Splitting makes the two shapes
  // impossible to confuse: updateOwnUser has no institutionId parameter to
  // forget (structurally can't touch another tenant's user — uid always
  // comes from the caller's own JWT), and updateUserAsAdmin's institutionId
  // is required, so a call site that omits it fails to compile.
  private async applyUserUpdate(
    uid: string,
    userData: UpdateUserDto,
  ): Promise<UserUidResult> {
    const existing = await this.prismaService.users.findUnique({
      where: { uid },
      select: { uid: true },
    });
    if (!existing)
      throw new NotFoundException(`User with uid ${uid} not found`);

    const data: any = Object.fromEntries(
      Object.entries(userData).filter(([, v]) => v !== undefined),
    );
    // userTypeId is intentionally not in UpdateUserDto anymore — changing a
    // user's platform-level type is a super_admin operation, not something
    // an institution administrator does (see Task 11 report, Finding A).
    // Deleted defensively too: `data` is untyped past this point, so a
    // caller bypassing the DTO (or a future field-set expansion) can't
    // smuggle it through to the raw update.
    delete data.userTypeId;

    const updated = await this.prismaService.users.update({
      where: { uid },
      data,
      select: { uid: true },
    });
    return { uid: updated.uid };
  }

  /** Self-service: uid is always the caller's own, from the JWT. */
  async updateOwnUser(
    uid: string,
    userData: UpdateUserDto,
  ): Promise<UserUidResult> {
    return this.applyUserUpdate(uid, userData);
  }

  /** Administrative: uid is an arbitrary target. institutionId is required. */
  async updateUserAsAdmin(
    uid: string,
    userData: UpdateUserDto,
    institutionId: string,
  ): Promise<UserUidResult> {
    await this.assertMemberOfInstitution(uid, institutionId);
    return this.applyUserUpdate(uid, userData);
  }

  // ─── updateUserPhoto: self-service vs. administrative ─────────────────
  private async applyUserPhotoUpdate(
    uid: string,
    photo: { base64: string; name: string; folder: string },
  ): Promise<UserUidResult> {
    const existing = await this.prismaService.users.findUnique({
      where: { uid },
      select: { uid: true, photoId: true },
    });
    if (!existing)
      throw new NotFoundException(`User with uid ${uid} not found`);

    const created = await this.photosService.createPhotoUseCase(photo);

    await this.prismaService.users.update({
      where: { uid },
      data: { photo: { connect: { uid: created.uid } } },
    });

    if (existing.photoId) {
      try {
        await this.photosService.deletePhotoUseCase(existing.photoId);
      } catch (err) {
        console.error(`Failed to delete old photo ${existing.photoId}:`, err);
        // Non-fatal: photo update succeeded; orphaned record will need manual cleanup
      }
    }

    return { uid: existing.uid, photo: { uid: created.uid } };
  }

  /** Self-service: uid is always the caller's own, from the JWT. */
  async updateOwnUserPhoto(
    uid: string,
    photo: { base64: string; name: string; folder: string },
  ): Promise<UserUidResult> {
    return this.applyUserPhotoUpdate(uid, photo);
  }

  /** Administrative: uid is an arbitrary target. institutionId is required. */
  async updateUserPhotoAsAdmin(
    uid: string,
    photo: { base64: string; name: string; folder: string },
    institutionId: string,
  ): Promise<UserUidResult> {
    await this.assertMemberOfInstitution(uid, institutionId);
    return this.applyUserPhotoUpdate(uid, photo);
  }

  // ─── deactivateUser: self-service vs. administrative ───────────────────
  private async applyDeactivation(uid: string): Promise<UserUidResult> {
    const user = await this.prismaService.users.findUnique({
      where: { uid },
      select: { uid: true },
    });
    if (!user) throw new NotFoundException(`User with uid ${uid} not found`);

    const updated = await this.prismaService.users.update({
      where: { uid },
      data: { isActive: false, finishAt: new Date() },
      select: { uid: true },
    });
    return { uid: updated.uid };
  }

  /** Self-service: uid is always the caller's own, from the JWT. */
  async deactivateOwnUser(uid: string): Promise<UserUidResult> {
    return this.applyDeactivation(uid);
  }

  /** Administrative: uid is an arbitrary target. institutionId is required. */
  async deactivateUserAsAdmin(
    uid: string,
    institutionId: string,
  ): Promise<UserUidResult> {
    await this.assertMemberOfInstitution(uid, institutionId);
    return this.applyDeactivation(uid);
  }

  // ─── reactivateUser: administrative only — no self-service route exists ──
  /** Administrative: uid is an arbitrary target. institutionId is required. */
  async reactivateUserAsAdmin(
    uid: string,
    institutionId: string,
  ): Promise<UserUidResult> {
    await this.assertMemberOfInstitution(uid, institutionId);

    const user = await this.prismaService.users.findUnique({
      where: { uid },
      select: { uid: true },
    });
    if (!user) throw new NotFoundException(`User with uid ${uid} not found`);

    const updated = await this.prismaService.users.update({
      where: { uid },
      data: { isActive: true, finishAt: null },
      select: { uid: true },
    });
    return { uid: updated.uid };
  }
}
