import {
  Controller,
  Get,
  Post,
  Patch,
  UseGuards,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClassesService } from './Classes.service';
import { AuthGuard } from 'src/guards/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { ActiveInstitution } from 'src/interface/jwtPayload';
import { CurrentUser } from 'src/decorators/currentUser';
import {
  ClassParamsDto,
  GroupParamDto,
  GetClassesDto,
  CreateClassDto,
  UpdateTopicDto,
  AttendDto,
} from './Classes.dto';

@ApiTags('classes')
@UseGuards(AuthGuard, TenantGuard)
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // Fixed-prefix routes first
  @Post('create')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Crear clase manual' })
  async create(
    @Body() body: CreateClassDto,
    @Institution() institution: ActiveInstitution,
  ) {
    return this.classesService.create({
      groupId: body.groupId,
      date: new Date(body.date),
      startTime: body.startTime,
      endTime: body.endTime,
      topic: body.topic,
      institutionId: institution.uid,
    });
  }

  @Post('attend')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('student')
  @ApiOperation({ summary: 'Registrar asistencia del estudiante autenticado' })
  async attend(
    @CurrentUser('uid') userId: string,
    @Body() body: AttendDto,
    @Institution() institution: ActiveInstitution,
  ) {
    return this.classesService.attend({
      classId: body.classId,
      userId,
      institutionId: institution.uid,
    });
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'Obtener sesiones del grupo para el calendario' })
  async getByGroup(
    @Param() params: GroupParamDto,
    @Query() query: GetClassesDto,
  ) {
    return this.classesService.getByGroup(params.groupId, query.from, query.to);
  }

  @Get('current/:groupId')
  @ApiOperation({ summary: '¿Hay clase activa ahora para el grupo?' })
  async getCurrent(@Param() params: GroupParamDto) {
    return this.classesService.getCurrentClass(params.groupId);
  }

  // Parameterized routes after
  @Get(':uid/attendance')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Listar estudiantes que asistieron a la clase' })
  async getAttendance(@Param() params: ClassParamsDto) {
    return this.classesService.getAttendance(params.uid);
  }

  @Patch(':uid/topic')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Actualizar temática y/o reseña de la clase' })
  async updateTopic(
    @Param() params: ClassParamsDto,
    @Body() body: UpdateTopicDto,
  ) {
    return this.classesService.updateTopic({
      classId: params.uid,
      topic: body.topic,
      review: body.review,
    });
  }
}
