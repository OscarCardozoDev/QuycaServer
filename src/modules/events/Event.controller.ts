import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { ActiveInstitution } from 'src/interface/jwtPayload';
import { EventService } from './Event.service';
import {
  CreateEventDto,
  UpdateEventDto,
  UpdateEventStatusDto,
  UpdateEventProductsDto,
  AddEventPhotoDto,
  SendInvitationDto,
  RespondInvitationDto,
  GetEventsDto,
  EventParamsDto,
  EventPhotoParamsDto,
  EventGroupParamsDto,
  InvitationParamsDto,
} from './Event.dto';

@ApiTags('events')
@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────

  @Post('create')
  @ApiOperation({ summary: 'Crear un evento' })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async create(
    @Body() body: CreateEventDto,
    @Institution()
    institution: ActiveInstitution,
  ) {
    return this.eventService.createEventUseCase({
      event: {
        name: body.name,
        description: body.description,
        eventType: body.eventType,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        locationUrl: body.locationUrl,
        isVirtual: body.isVirtual,
        streamingUrl: body.streamingUrl,
        createdById: body.createdById,
        institutionId: institution.uid,
      },
      groupIds: body.groupIds,
      productIds: body.productIds,
      coverPhoto: body.coverPhoto,
    });
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  @Get('getAll')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @ApiOperation({ summary: 'Obtener todos los eventos paginados (admin)' })
  @RequireContextRole('rector', 'coordinator')
  async getAll(@Query() query: GetEventsDto) {
    return this.eventService.getAll(query);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Obtener eventos próximos aprobados (público)' })
  async getUpcoming(@Query() query: GetEventsDto) {
    return this.eventService.getUpcoming(query);
  }

  @Get('past')
  @ApiOperation({ summary: 'Obtener eventos pasados completados (público)' })
  async getPast(@Query() query: GetEventsDto) {
    return this.eventService.getPast(query);
  }

  @Get('home')
  @ApiOperation({
    summary: 'Obtener eventos próximos para la página de inicio (público)',
  })
  async getHome(@Query() query: GetEventsDto) {
    return this.eventService.getHome(query);
  }

  @Get('getByGroup/:uid')
  @ApiOperation({ summary: 'Obtener eventos de un grupo específico (público)' })
  async getByGroup(
    @Param('uid', new ParseUUIDPipe()) groupId: string,
    @Query() query: GetEventsDto,
  ) {
    return this.eventService.getByGroup(groupId, query);
  }

  @Get('group/:uid')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({
    summary: 'Eventos del grupo, acotados a la institución activa',
  })
  async getByGroupPrivate(
    @Param('uid', new ParseUUIDPipe()) groupId: string,
    @Query() query: GetEventsDto,
  ) {
    return this.eventService.getByGroupPrivate(groupId, query);
  }

  @Get('available-products/:groupId')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @ApiOperation({
    summary: 'Obtener obras APPROVED del grupo disponibles para un evento',
  })
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async getAvailableProducts(
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
  ) {
    return this.eventService.getAvailableProducts(groupId);
  }

  @Get('invitations/pending')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @ApiOperation({
    summary: 'Ver invitaciones pendientes del profesor autenticado',
  })
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async getPendingInvitations(@Query('profesorId') profesorId: string) {
    return this.eventService.getPendingInvitations(profesorId);
  }

  @Get('get/:uid')
  @ApiOperation({ summary: 'Obtener detalle completo de un evento (público)' })
  async getById(@Param() params: EventParamsDto) {
    return this.eventService.getById(params.uid);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  @Put('update/:uid')
  @ApiOperation({
    summary: 'Editar info general del evento (vuelve a PENDING)',
  })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async update(@Param() params: EventParamsDto, @Body() body: UpdateEventDto) {
    return this.eventService.updateEventUseCase({
      eventId: params.uid,
      data: {
        name: body.name,
        description: body.description,
        eventType: body.eventType,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        locationUrl: body.locationUrl,
        isVirtual: body.isVirtual,
        streamingUrl: body.streamingUrl,
      },
    });
  }

  @Patch('status/:uid')
  @ApiOperation({ summary: 'Cambiar el status de un evento (admin)' })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  async updateStatus(
    @Param('uid', new ParseUUIDPipe()) uid: string,
    @Body() dto: UpdateEventStatusDto,
  ) {
    return this.eventService.updateStatus({
      uid,
      status: dto.status,
      feedback: dto.feedback,
    });
  }

  @Patch('deactivate/:uid')
  @ApiOperation({ summary: 'Desactivar un evento (soft delete, admin)' })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  async deactivate(@Param('uid', new ParseUUIDPipe()) uid: string) {
    return this.eventService.deactivate(uid);
  }

  // ─── PRODUCTS DEL EVENTO ──────────────────────────────────────────────────

  @Put(':uid/products')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @ApiOperation({
    summary: 'Actualizar obras del grupo en el evento (vuelve a PENDING)',
  })
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async updateProducts(
    @Param() params: EventParamsDto,
    @Body() body: UpdateEventProductsDto,
  ) {
    return this.eventService.updateEventProducts({
      eventId: params.uid,
      productIds: body.productIds,
      requestingGroupId: body.groupId,
    });
  }

  // ─── FOTOS DEL EVENTO ─────────────────────────────────────────────────────

  @Post(':uid/photos')
  @ApiOperation({
    summary:
      'Agregar foto al evento (HERO/PROMO: coordinador/admin · MEMORY: participante)',
  })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async addPhoto(
    @Param() params: EventParamsDto,
    @Body() body: AddEventPhotoDto,
  ) {
    return this.eventService.addPhoto({
      eventId: params.uid,
      images: body.images,
    });
  }

  @Delete(':uid/photos/:photoId')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @ApiOperation({ summary: 'Eliminar una foto del evento' })
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async removePhoto(@Param() params: EventPhotoParamsDto) {
    return this.eventService.removePhoto(params.uid, params.photoId);
  }

  // ─── INVITACIONES ─────────────────────────────────────────────────────────

  @Post(':uid/invite')
  @ApiOperation({ summary: 'Enviar invitación a un grupo (coordinador/admin)' })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async sendInvitation(
    @Param() params: EventParamsDto,
    @Body() body: SendInvitationDto,
  ) {
    return this.eventService.sendInvitation(params.uid, body.groupId);
  }

  @Patch('invitations/:uid/respond')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @ApiOperation({
    summary: 'Aceptar o rechazar una invitación (profesor invitado)',
  })
  @RequireContextRole('institutional')
  async respondInvitation(
    @Param() params: InvitationParamsDto,
    @Body() dto: RespondInvitationDto,
  ) {
    return this.eventService.respondInvitation({
      invitationId: params.uid,
      status: dto.status,
    });
  }

  @Delete(':uid/invite/:groupId')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @ApiOperation({
    summary: 'Revocar invitación de un grupo (coordinador/admin)',
  })
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async revokeInvitation(@Param() params: EventGroupParamsDto) {
    return this.eventService.revokeInvitation(params.uid, params.groupId);
  }

  @Delete(':uid/groups/:groupId')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @ApiOperation({
    summary: 'Quitar un grupo del evento directamente (coordinador/admin)',
  })
  @RequireContextRole('institutional', 'rector', 'coordinator')
  async removeGroup(@Param() params: EventGroupParamsDto) {
    return this.eventService.removeGroupFromEvent(params.uid, params.groupId);
  }
}
