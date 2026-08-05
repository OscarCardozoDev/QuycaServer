import {
  Controller, Post, Get, Patch, Body, Param, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InstitutionService } from './Institution.service';
import { AuthGuard } from 'src/middleware/jwt.guard';
import { TenantGuard } from 'src/guards/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
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
  async update(@Param('id') id: string, @Body() dto: UpdateInstitutionDto) {
    return this.institutionService.update(id, dto);
  }

  @Post('institutions/:id/invitations')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Enviar invitación a profesor o estudiante' })
  async createInvitation(@Param('id') id: string, @Body() dto: CreateInvitationDto) {
    return this.institutionService.createInvitation({
      institutionId: id,
      toEmail: dto.toEmail,
      targetRole: dto.targetRole,
      expiresInDays: dto.expiresInDays,
    });
  }

  @Get('institutions/:id/invitations')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Listar invitaciones de la institución' })
  async getInvitations(@Param('id') id: string) {
    return this.institutionService.getInvitations(id);
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
