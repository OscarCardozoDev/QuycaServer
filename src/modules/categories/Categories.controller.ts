import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CategoriesService } from './Categories.service';
import { AuthGuard } from 'src/middleware/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Roles } from 'src/decorators/roles.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateContentRequestDto, ReviewContentRequestDto,
} from './Categories.dto';

@ApiTags('categories')
@Controller()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Listar categorías activas (público)' })
  getActiveCategories() {
    return this.categoriesService.getActiveCategories();
  }

  @Post('categories')
  @UseGuards(AuthGuard)
  @Roles('super_admin')
  @ApiOperation({ summary: 'Crear categoría global (SUPER_ADMIN)' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.createCategory(dto);
  }

  @Patch('categories/:id')
  @UseGuards(AuthGuard)
  @Roles('super_admin')
  @ApiOperation({ summary: 'Actualizar categoría global (SUPER_ADMIN)' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.updateCategory(id, dto);
  }

  @Post('content-requests')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Solicitar nueva categoría o estilo' })
  createRequest(
    @Body() dto: CreateContentRequestDto,
    @Institution() institution: { uid: string },
  ) {
    return this.categoriesService.createContentRequest({
      institutionId: institution.uid,
      type: dto.type,
      requestedName: dto.requestedName,
      categoryId: dto.categoryId,
      justification: dto.justification,
    });
  }

  @Get('content-requests')
  @UseGuards(AuthGuard)
  @Roles('super_admin')
  @ApiOperation({ summary: 'Listar todas las solicitudes (SUPER_ADMIN)' })
  getAllRequests() {
    return this.categoriesService.getAllContentRequests();
  }

  @Get('content-requests/mine')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Listar solicitudes de la institución activa' })
  getMyRequests(@Institution() institution: { uid: string }) {
    return this.categoriesService.getInstitutionContentRequests(institution.uid);
  }

  @Patch('content-requests/:id/review')
  @UseGuards(AuthGuard)
  @Roles('super_admin')
  @ApiOperation({ summary: 'Aprobar o rechazar solicitud (SUPER_ADMIN)' })
  reviewRequest(
    @Param('id') id: string,
    @Body() dto: ReviewContentRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.categoriesService.reviewContentRequest({
      requestId: id,
      reviewedBy: req.user.uid,
      approved: dto.approved,
      reviewNote: dto.reviewNote,
    });
  }
}
