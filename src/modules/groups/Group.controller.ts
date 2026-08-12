import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  UseGuards,
  Body,
  Param,
  Query,
  Req,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from 'src/decorators/currentUser';
import { GroupService } from './Group.service';
import { AuthGuard } from 'src/middleware/jwt.guard';
import {
  GroupParamsDto,
  GetGroupsDto,
  CreateGroupDto,
  UpdateGroupDto,
  AddStudentDto,
  DeleteStudentDto,
  UpdateStudentsDto,
  ChangeProfesorDto,
} from './Group.dto';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { FeatureGuard } from 'src/guards/feature.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { RequireFeature } from 'src/decorators/feature.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import type { Institution as InstitutionModel, SubscriptionPlan } from 'src/generated/prisma/client';

@ApiTags('groups')
@UseGuards(AuthGuard, TenantGuard)
@Controller('groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post('create')
  @UseGuards(ContextRoleGuard, FeatureGuard)
  @RequireContextRole('rector', 'coordinator')
  @RequireFeature('groups_create')
  @ApiOperation({ summary: 'Crear grupo' })
  async create(
    @Body() body: CreateGroupDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.groupService.createGroupUseCase({
      ...body,
      institutionId: institution.uid,
    });
  }

  @Get('get')
  @ApiOperation({ summary: 'Obtener todos los grupos' })
  async getAll(@Query() query: GetGroupsDto) {
    return this.groupService.getAll(query);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Grupos del usuario autenticado' })
  async getMine(
    @CurrentUser('uid') uid: string,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.groupService.getMyGroups(uid, institution.uid);
  }

  @Get('get/:uid')
  @ApiOperation({ summary: 'Obtener grupo por UID' })
  async getById(@Param() params: GroupParamsDto) {
    const group = await this.groupService.getById(params.uid);

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  @Put('update/:uid')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Actualizar grupo' })
  async update(
    @Param() params: GroupParamsDto,
    @Body() body: UpdateGroupDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.groupService.updateGroupUseCase({
      groupId: params.uid,
      institutionId: institution.uid,
      data: {
        name: body.name,
        profesorId: body.profesorId,
      },
    });
  }

  @Delete('delete/:uid')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Eliminar grupo' })
  async delete(@Param() params: GroupParamsDto) {
    await this.groupService.deleteGroup(params.uid);
    return { success: true };
  }

  @Patch('change-profesor/:uid')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Cambiar el profesor asignado al grupo' })
  async changeProfesor(
    @Param() params: GroupParamsDto,
    @Body() body: ChangeProfesorDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.groupService.changeProfesor({
      groupId: params.uid,
      newProfesorId: body.newProfesorId,
      institutionId: institution.uid,
    });
  }

  @Post('student/add')
  @ApiOperation({ summary: 'Agregar estudiante a grupo(s)' })
  async addStudent(
    @CurrentUser('uid') uid: string,
    @Body() body: AddStudentDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
    @Req() req: AuthenticatedRequest,
  ) {
    const targetUserId = body.userId ?? uid;
    if (targetUserId !== uid && !['rector', 'coordinator', 'institutional'].includes(req.contextRole || '')) {
      throw new ForbiddenException('Solo un rector, coordinador o profesor puede agregar a otra persona a un grupo');
    }
    return this.groupService.addStudentToGroups({
      userId: targetUserId,
      groupIds: body.groupIds,
      institutionId: institution.uid,
    });
  }

  @Get('student/get/:groupId')
  @ApiOperation({ summary: 'Obtener estudiantes de un grupo' })
  async getAllStudents(@Param('groupId') groupId: string) {
    return this.groupService.getAllStudentsByGroup(groupId);
  }

  @Delete('student/delete/:groupId')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Eliminar un estudiante del grupo' })
  async deleteStudent(
    @Param('groupId') groupId: string,
    @Body() body: DeleteStudentDto,
  ) {
    await this.groupService.deleteOneStudentByGroup({
      groupId,
      userId: body.userId,
    });
    return { success: true };
  }

  @Delete('student/deleteAll/:groupId')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Eliminar todos los estudiantes del grupo' })
  async deleteAllStudents(@Param('groupId') groupId: string) {
    await this.groupService.deleteStudentsByGroup(groupId);
    return { success: true };
  }

  @Put('student/update/:groupId')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Actualizar lista de estudiantes del grupo' })
  async updateStudents(
    @Param('groupId') groupId: string,
    @Body() body: UpdateStudentsDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.groupService.updateStudentsByGroup({
      groupId,
      users: body.users,
      institutionId: institution.uid,
    });
  }
}
