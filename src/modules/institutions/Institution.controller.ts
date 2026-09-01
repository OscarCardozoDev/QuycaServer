import {
  Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, Req, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstitutionService } from './Institution.service';
import { AuthGuard } from 'src/guards/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { ActiveInstitution, AuthenticatedRequest } from 'src/interface/jwtPayload';
import {
  CreateInstitutionDto, UpdateInstitutionDto,
  CreateInvitationDto, RespondInvitationDto, ChangePlanDto,
} from './Institution.dto';

@ApiTags('institutions')
@Controller()
export class InstitutionController {
  constructor(private readonly institutionService: InstitutionService) {}

  // 3 cada hora: es público y sin auth, y una institución se registra una
  // vez en la vida. Contado por AccountThrottlerGuard vía `body.email`
  // (CreateInstitutionDto usa ese nombre, no `mail`).
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('institutions')
  @ApiOperation({ summary: 'Registrar nueva institución (público)' })
  async create(@Body() dto: CreateInstitutionDto) {
    return this.institutionService.createInstitution(dto);
  }

  @Get('institutions/:slug')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Obtener institución por slug' })
  async getBySlug(@Param('slug') slug: string, @Req() req: AuthenticatedRequest) {
    return this.institutionService.getBySlug(slug, req.user.uid);
  }

  @Patch('institutions/:id')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Actualizar datos de institución' })
  async update(
    @Param('id') _id: string,
    @Body() dto: UpdateInstitutionDto,
    @Institution() institution: ActiveInstitution,
  ) {
    return this.institutionService.update(institution.uid, dto);
  }

  @Delete('institutions/:id/membership')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Salir de una institución (el propio usuario)' })
  async leave(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    // Sin TenantGuard a propósito: se sale de una institución cualquiera de las
    // propias, no necesariamente de la activa. Quién sale lo dice el JWT, así
    // que el `:id` sólo elige la membresía, nunca autoriza.
    return this.institutionService.leaveInstitution(req.user.uid, id);
  }

  @Patch('institutions/:id/plan')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector')
  @ApiOperation({ summary: 'Elegir o cambiar el plan de la institución' })
  async changePlan(
    @Param('id') id: string,
    @Body() dto: ChangePlanDto,
    @Institution() institution: ActiveInstitution,
  ) {
    // El `:id` NO autoriza: la institución la resuelve el TenantGuard desde el
    // header X-Institution-Slug. Se valida que coincidan para que el parámetro
    // no sugiera un control que no existe.
    if (id !== institution.uid) {
      throw new ForbiddenException('El id no corresponde a la institución activa');
    }
    return this.institutionService.changePlan(institution.uid, dto.planSlug ?? null);
  }

  // 30 cada hora: autenticado, el rector invita en tanda (ej. toda una
  // clase al arrancar el semestre).
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('institutions/:id/invitations')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Enviar invitación a profesor o estudiante' })
  async createInvitation(
    @Param('id') _id: string,
    @Body() dto: CreateInvitationDto,
    @Institution() institution: ActiveInstitution,
  ) {
    return this.institutionService.createInvitation({
      institutionId: institution.uid,
      toEmail: dto.toEmail,
      targetRole: dto.targetRole,
    });
  }

  @Get('institutions/:id/invitations')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Listar invitaciones de la institución' })
  async getInvitations(
    @Param('id') _id: string,
    @Institution() institution: ActiveInstitution,
  ) {
    return this.institutionService.getInvitations(institution.uid);
  }

  /**
   * Las invitaciones que le llegaron al usuario autenticado.
   *
   * ⚠️ SIN TenantGuard, y no es un olvido. La invitación viene de una
   * institución donde el usuario todavía NO es miembro; el TenantGuard resuelve
   * el X-Institution-Slug y exige membresía activa, así que agregarlo devolvería
   * 403 justo en el caso que este endpoint existe para resolver. Además el
   * usuario puede tener invitaciones de varias instituciones a la vez: no hay
   * un tenant único que poner en el header. El aislamiento acá lo da el filtro
   * por correo del usuario (ver InstitutionService.getMyInvitations), no el
   * tenant. No le agregues TenantGuard.
   *
   * ⚠️ Va declarada ANTES que 'invitations/:token': Nest resuelve las rutas en
   * orden de declaración y 'mine' matchearía como token si se invierte.
   */
  @Get('invitations/mine')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Listar las invitaciones vigentes del usuario autenticado' })
  async getMyInvitations(@Req() req: AuthenticatedRequest) {
    return this.institutionService.getMyInvitations(req.user.uid);
  }

  @Get('invitations/:token')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Obtener detalles de invitación por token' })
  async getInvitation(@Param('token') token: string) {
    return this.institutionService.getInvitationByToken(token);
  }

  @Post('invitations/:token/respond')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Aceptar o rechazar invitación' })
  async respond(
    @Param('token') token: string,
    @Body() dto: RespondInvitationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.institutionService.respondToInvitation({
      token,
      userId: req.user.uid,
      accept: dto.accept,
    });
  }
}
