import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  UseGuards,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ScheduleService } from './Schedule.service';
import { AuthGuard } from 'src/middleware/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { Institution as InstitutionModel, SubscriptionPlan } from 'src/generated/prisma/client';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  ScheduleParamsDto,
  GroupParamDto,
} from './Schedule.dto';

@ApiTags('schedule')
@UseGuards(AuthGuard, TenantGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post('create')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Crear horario y generar sesiones del semestre' })
  async create(
    @Body() body: CreateScheduleDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.scheduleService.create({
      ...body,
      institutionId: institution.uid,
    });
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'Obtener horarios activos del grupo' })
  async getByGroup(@Param() params: GroupParamDto) {
    return this.scheduleService.getByGroup(params.groupId);
  }

  @Put(':uid')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Actualizar horario y regenerar sesiones futuras' })
  async update(
    @Param() params: ScheduleParamsDto,
    @Body() body: UpdateScheduleDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.scheduleService.update({
      scheduleId: params.uid,
      data: body,
      institutionId: institution.uid,
    });
  }

  @Delete(':uid')
  @UseGuards(ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({
    summary: 'Desactivar horario y eliminar sesiones futuras sin asistencia',
  })
  async remove(@Param() params: ScheduleParamsDto) {
    return this.scheduleService.remove(params.uid);
  }
}
