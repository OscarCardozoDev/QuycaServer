import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { StylesService } from './Styles.service';
import { CreateStyleDto, UpdateStyleDto } from './Styles.dto';
import { AuthGuard } from 'src/guards/jwt.guard';
import { Roles } from 'src/decorators/roles.decorator';

/**
 * El catálogo de estilos es de la plataforma, no de una institución: `Styles`
 * dejó de tener `groupId` e `institutionId` el 2026-08-24 y salió de
 * `SCOPED_MODELS`.
 *
 * De ahí los guards: **leer es público** —la galería es una vitrina sin sesión—
 * y **escribir es solo `super_admin`**, igual que `GroupCategory`. Si un rector
 * pudiera editar, renombrar "Acuarela" se lo renombraría a todas las
 * instituciones a la vez.
 *
 * No lleva `CrossTenantGuard` ni `@AllowCrossTenant()`, a diferencia de los
 * endpoints de super_admin sobre modelos scopeados: esos existen para apagar la
 * extensión de Prisma, y acá no hay extensión que apagar.
 */
@ApiTags('styles')
@Controller('styles')
export class StylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Get('all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Catálogo completo de estilos (público)' })
  async getAllStyles() {
    return this.stylesService.getAll();
  }

  @Get('all/:categoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estilos de una categoría (público)' })
  @ApiParam({
    name: 'categoryId',
    type: 'string',
    description: 'UUID de la categoría (GroupCategory)',
  })
  async getAllByCategory(@Param('categoryId') categoryId: string) {
    return this.stylesService.getAllByCategory(categoryId);
  }

  @Get('get/:uid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener estilo por UID (público)' })
  async getById(@Param('uid') uid: string) {
    return this.stylesService.get(uid);
  }

  @Post('create')
  @UseGuards(AuthGuard)
  @Roles('super_admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear estilo (solo super_admin)' })
  async createStyle(@Body() body: CreateStyleDto) {
    return this.stylesService.create(body);
  }

  @Put('update/:uid')
  @UseGuards(AuthGuard)
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar estilo (solo super_admin)' })
  async updateStyle(@Param('uid') uid: string, @Body() body: UpdateStyleDto) {
    return this.stylesService.update(uid, body);
  }

  @Delete('delete/:uid')
  @UseGuards(AuthGuard)
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar estilo (solo super_admin)' })
  async deleteStyle(@Param('uid') uid: string) {
    return this.stylesService.delete(uid);
  }
}
