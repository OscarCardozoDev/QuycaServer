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
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from 'src/decorators/currentUser';
import { GroupService } from './Group.service';
import { AuthGuard } from 'src/middleware/jwt.guard';
import { Roles } from 'src/decorators/roles.decorator';
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
import { TenantGuard } from 'src/guards/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { FeatureGuard } from 'src/guards/feature.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { RequireFeature } from 'src/decorators/feature.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { Institution as InstitutionModel, SubscriptionPlan } from 'src/generated/prisma/client';

@ApiTags('groups')
@UseGuards(AuthGuard)
@Controller('groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post('create')
  @UseGuards(TenantGuard, ContextRoleGuard, FeatureGuard)
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
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Obtener todos los grupos' })
  async getAll(
    @Query() query: GetGroupsDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.groupService.getAll({ ...query, institutionId: institution.uid });
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
  @Roles('admin')
  @ApiOperation({ summary: 'Actualizar grupo' })
  async update(@Param() params: GroupParamsDto, @Body() body: UpdateGroupDto) {
    return this.groupService.updateGroupUseCase({
      groupId: params.uid,
      data: {
        name: body.name,
        profesorId: body.profesorId,
      },
    });
  }

  @Delete('delete/:uid')
  @Roles('admin')
  @ApiOperation({ summary: 'Eliminar grupo' })
  async delete(@Param() params: GroupParamsDto) {
    await this.groupService.deleteGroup(params.uid);
    return { success: true };
  }

  @Patch('change-profesor/:uid')
  @Roles('admin')
  @ApiOperation({ summary: 'Cambiar el profesor asignado al grupo' })
  async changeProfesor(
    @Param() params: GroupParamsDto,
    @Body() body: ChangeProfesorDto,
  ) {
    return this.groupService.changeProfesor({
      groupId: params.uid,
      newProfesorId: body.newProfesorId,
    });
  }

  @Post('student/add')
  @ApiOperation({ summary: 'Agregar estudiante a grupo(s)' })
  async addStudent(
    @CurrentUser('uid') uid: string,
    @Body() body: AddStudentDto,
  ) {
    const userId = body.userId ?? uid;
    return this.groupService.addStudentToGroups({
      userId,
      groupIds: body.groupIds,
    });
  }

  @Get('student/get/:groupId')
  @ApiOperation({ summary: 'Obtener estudiantes de un grupo' })
  async getAllStudents(@Param('groupId') groupId: string) {
    return this.groupService.getAllStudentsByGroup(groupId);
  }

  @Delete('student/delete/:groupId')
  @Roles('admin', 'professor')
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
  @Roles('admin')
  @ApiOperation({ summary: 'Eliminar todos los estudiantes del grupo' })
  async deleteAllStudents(@Param('groupId') groupId: string) {
    await this.groupService.deleteStudentsByGroup(groupId);
    return { success: true };
  }

  @Put('student/update/:groupId')
  @Roles('admin', 'professor')
  @ApiOperation({ summary: 'Actualizar lista de estudiantes del grupo' })
  async updateStudents(
    @Param('groupId') groupId: string,
    @Body() body: UpdateStudentsDto,
  ) {
    return this.groupService.updateStudentsByGroup({
      groupId,
      users: body.users,
    });
  }
}
