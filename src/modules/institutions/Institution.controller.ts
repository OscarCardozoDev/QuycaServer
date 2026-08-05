import {
  Controller, Post, Get, Patch, Body, Param, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InstitutionService } from './Institution.service';
import { AuthGuard } from 'src/middleware/jwt.guard';
import { TenantGuard } from 'src/guards/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import type { Institution as InstitutionModel, SubscriptionPlan } from 'src/generated/prisma/client';
import {
  CreateInstitutionDto, UpdateInstitutionDto,
  CreateInvitationDto, RespondInvitationDto,
} from './Institution.dto';

@ApiTags('institutions')
@Controller()
export class InstitutionController {
  constructor(private readonly institutionService: InstitutionService) {}

  @Post('institutions')
  @ApiOperation({ summary: 'Registrar nueva institución (público)' })
  async create(@Body() dto: CreateInstitutionDto) {
    return this.institutionService.createInstitution(dto);
  }

  @Get('institutions/:slug')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Obtener institución por slug' })
  async getBySlug(@Param('slug') slug: string) {
    return this.institutionService.getBySlug(slug);
  }

  @Patch('institutions/:id')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Actualizar datos de institución' })
  async update(
    @Param('id') _id: string,
    @Body() dto: UpdateInstitutionDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.institutionService.update(institution.uid, dto);
  }

  @Post('institutions/:id/invitations')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Enviar invitación a profesor o estudiante' })
  async createInvitation(
    @Param('id') _id: string,
    @Body() dto: CreateInvitationDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.institutionService.createInvitation({
      institutionId: institution.uid,
      toEmail: dto.toEmail,
      targetRole: dto.targetRole,
      expiresInDays: dto.expiresInDays,
    });
  }

  @Get('institutions/:id/invitations')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Listar invitaciones de la institución' })
  async getInvitations(
    @Param('id') _id: string,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.institutionService.getInvitations(institution.uid);
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
