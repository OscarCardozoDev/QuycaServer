import { Controller, Get, Post, Patch, Put, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CategoriesService } from './Categories.service';
import { AuthGuard } from 'src/middleware/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Roles } from 'src/decorators/roles.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import { AllowCrossTenant } from 'src/decorators/cross-tenant.decorator';
import { CrossTenantGuard } from 'src/tenant/cross-tenant.guard';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateContentRequestDto, ReviewContentRequestDto,
  SetOfferedCategoriesDto,
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

  /**
   * Las dos rutas de "oferta" van declaradas ANTES de cualquier
   * `categories/:algo`: Nest resuelve en orden de declaración y 'offered'
   * matchearía como parámetro. Hoy no hay un GET con parámetro acá, pero el
   * PATCH `categories/:id` ya existe y la próxima ruta con `:id` no debería
   * tener que enterarse de esto por un 404 raro.
   *
   * El rol pedido es el mismo para leer y para escribir: la lista de qué
   * oferta la institución es material de la pantalla de configuración del
   * rector. La lista pública de las 5 categorías del catálogo es GET
   * /categories, que no pide nada.
   */
  @Get('categories/offered')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Categorías que oferta la institución activa' })
  getOfferedCategories(@Institution() institution: { uid: string }) {
    return this.categoriesService.getOfferedCategories(institution.uid);
  }

  @Put('categories/offered')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @ApiOperation({ summary: 'Definir qué categorías oferta la institución activa' })
  setOfferedCategories(
    @Body() dto: SetOfferedCategoriesDto,
    @Institution() institution: { uid: string },
  ) {
    return this.categoriesService.setOfferedCategories(institution.uid, dto.categoryIds);
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
  @UseGuards(AuthGuard, CrossTenantGuard)
  @Roles('super_admin')
  @AllowCrossTenant()
  @ApiOperation({ summary: 'Listar todas las solicitudes (SUPER_ADMIN)' })
  getAllRequests() {
    return this.categoriesService.getAllContentRequests();
  }

  @Get('content-requests/mine')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Listar solicitudes de la institución activa' })
  getMyRequests() {
    return this.categoriesService.getInstitutionContentRequests();
  }

  @Patch('content-requests/:id/review')
  @UseGuards(AuthGuard, CrossTenantGuard)
  @Roles('super_admin')
  @AllowCrossTenant()
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
