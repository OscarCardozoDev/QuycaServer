import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { CurrentUser } from 'src/decorators/currentUser';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import { LessonService } from './Lesson.service';
import { ChapterService } from './Chapter.service';
import {
  ChapterParamsDto, CreateChapterDto, UpdateChapterDto, ReorderChaptersDto,
} from './Chapter.dto';

@ApiTags('lessons')
@UseGuards(AuthGuard, TenantGuard)
@Controller('lessons/:lessonId/chapters')
export class ChapterController {
  constructor(
    private readonly lessonService: LessonService,
    private readonly chapterService: ChapterService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Capítulos de una lección, ordenados' })
  list(
    @Param('lessonId') lessonId: string,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonService.readChapters(lessonId, uid, req.contextRole || '');
  }

  @Post()
  @ApiOperation({ summary: 'Agregar un capítulo al final' })
  create(
    @Param('lessonId') lessonId: string,
    @Body() body: CreateChapterDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chapterService.create(lessonId, body, uid, req.contextRole || '');
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reordenar los capítulos' })
  async reorder(
    @Param('lessonId') lessonId: string,
    @Body() body: ReorderChaptersDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.chapterService.reorder(lessonId, body.uids, uid, req.contextRole || '');
    return { success: true };
  }

  @Get(':uid')
  @ApiOperation({ summary: 'Un capítulo con su navegación anterior/siguiente' })
  read(
    @Param() params: ChapterParamsDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lessonService.readChapter(
      params.lessonId,
      params.uid,
      uid,
      req.contextRole || '',
    );
  }

  @Post(':uid/complete')
  @ApiOperation({ summary: 'Marcar el capítulo como completado' })
  complete(
    @Param() params: ChapterParamsDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chapterService.complete(
      params.lessonId,
      params.uid,
      uid,
      req.contextRole || '',
    );
  }

  @Put(':uid')
  @ApiOperation({ summary: 'Actualizar un capítulo' })
  update(
    @Param() params: ChapterParamsDto,
    @Body() body: UpdateChapterDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chapterService.update(
      params.lessonId,
      params.uid,
      body,
      uid,
      req.contextRole || '',
    );
  }

  @Delete(':uid')
  @ApiOperation({ summary: 'Desactivar un capítulo y recompactar la secuencia' })
  async remove(
    @Param() params: ChapterParamsDto,
    @CurrentUser('uid') uid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.chapterService.deactivate(
      params.lessonId,
      params.uid,
      uid,
      req.contextRole || '',
    );
    return { success: true };
  }
}
