import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/middleware/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { CrossTenantGuard } from 'src/tenant/cross-tenant.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Roles } from 'src/decorators/roles.decorator';
import { AllowCrossTenant } from 'src/decorators/cross-tenant.decorator';
import { CurrentUser } from 'src/decorators/currentUser';
import { Institution } from 'src/decorators/institution.decorator';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import type { Institution as InstitutionModel } from 'src/generated/prisma/client';
import { LessonService } from './Lesson.service';
import {
  LessonParamsDto, CreateLessonDto, UpdateLessonDto,
  ListLessonsDto, InstitutionQueueDto, ReviewLessonDto,
} from './Lesson.dto';

@ApiTags('lessons')
@Controller('lessons')
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  @Post('create')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @ApiOperation({ summary: 'Crear una lección (nace en DRAFT)' })
  create(
    @Body() body: CreateLessonDto,
    @CurrentUser('uid') uid: string,
    @Institution() institution: InstitutionModel,
  ) {
    return this.lessonService.createLesson({
      title: body.title,
      summary: body.summary,
      groupId: body.groupId,
      categoryId: body.categoryId,
      authorId: uid,
      institutionId: institution.uid,
    });
  }

  @Get('mine')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Lecciones del docente autenticado, en todo estado' })
  getMine(@CurrentUser('uid') uid: string) {
    return this.lessonService.getMine(uid);
  }

  @Get('get')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Todas las lecciones de la institución activa' })
  getForInstitution(@Query() query: InstitutionQueueDto) {
    return this.lessonService.getForInstitution(query.status);
  }

  @Get('available')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Lecciones aprobadas, filtradas por categoría' })
  getAvailable(
    @Query() query: ListLessonsDto,
    @CurrentUser('uid') uid: string,
    @Institution() institution: InstitutionModel,
  ) {
    return this.lessonService.getAvailable(uid, institution.uid, query.category);
  }

  // Única ruta del módulo sin TenantGuard: un catálogo cross-tenant no tiene
  // institución activa que resolver. Conserva AuthGuard — el contenido es
  // privado a usuarios registrados.
  //
  // Declarada antes que cualquier @Get(':algo') de dos segmentos: hoy el
  // único detalle es `get/:uid`, pero si alguien agrega un @Get(':uid') de un
  // segmento después, capturaría /lessons/catalog.
  @Get('catalog')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Oferta global de Quyca' })
  catalog(@Query() query: ListLessonsDto) {
    return this.lessonService.getGlobalCatalog(query.category);
  }

  @Get('admin')
  @UseGuards(AuthGuard, CrossTenantGuard)
  @Roles('super_admin')
  @AllowCrossTenant()
  @ApiOperation({ summary: 'Cola de revisión global (SUPER_ADMIN)' })
  adminQueue(@Query('status') status?: string) {
    return this.lessonService.getAdminQueue(status);
  }

  @Patch('admin/:uid/review')
  @UseGuards(AuthGuard, CrossTenantGuard)
  @Roles('super_admin')
  @AllowCrossTenant()
  @ApiOperation({ summary: 'Aprobar o rechazar en la oferta global (SUPER_ADMIN)' })
  reviewGlobal(
    @Param() params: LessonParamsDto,
    @Body() body: ReviewLessonDto,
    @CurrentUser('uid') uid: string,
  ) {
    return this.lessonService.reviewGlobal({
      lessonId: params.uid,
      reviewerId: uid,
      approve: body.approve,
      feedback: body.feedback,
    });
  }

  @Get('get/:uid')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Detalle de una lección' })
  getById(
    @Param() params: LessonParamsDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonService.getReadableLesson(params.uid, uid, req.contextRole || '');
  }

  // Sin @RequireContextRole a propósito: `institutional` tiene que poder
  // editar LA SUYA, y un guard de rol no ve el :uid de la ruta. El chequeo
  // vive en assertCanEditLesson. Mismo criterio que PUT /groups/update/:uid.
  @Put('update/:uid')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Actualizar una lección' })
  update(
    @Param() params: LessonParamsDto,
    @Body() body: UpdateLessonDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonService.updateLesson({
      lessonId: params.uid,
      userId: uid,
      contextRole: req.contextRole || '',
      data: {
        title: body.title,
        summary: body.summary,
        categoryId: body.categoryId,
        coverPhotoId: body.coverPhotoId,
      },
    });
  }

  @Delete('delete/:uid')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Desactivar una lección' })
  async remove(
    @Param() params: LessonParamsDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.lessonService.deactivateLesson(params.uid, uid, req.contextRole || '');
    return { success: true };
  }

  @Post(':uid/submit')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Enviar la lección a revisión de la institución' })
  submit(
    @Param() params: LessonParamsDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonService.submitForReview(params.uid, uid, req.contextRole || '');
  }

  @Patch(':uid/review')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Aprobar o rechazar la lección (nivel institución)' })
  review(
    @Param() params: LessonParamsDto,
    @Body() body: ReviewLessonDto,
    @CurrentUser('uid') uid: string,
  ) {
    return this.lessonService.reviewByInstitution({
      lessonId: params.uid,
      reviewerId: uid,
      approve: body.approve,
      feedback: body.feedback,
    });
  }

  @Post(':uid/submit-global')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Postular la lección a la oferta global' })
  submitGlobal(@Param() params: LessonParamsDto) {
    return this.lessonService.submitGlobal(params.uid);
  }

  @Post(':uid/unpublish')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Retirar la lección del catálogo global' })
  unpublish(@Param() params: LessonParamsDto) {
    return this.lessonService.unpublish(params.uid);
  }
}
