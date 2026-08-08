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
import { AuthGuard } from 'src/middleware/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import type { Institution as InstitutionModel, SubscriptionPlan } from 'src/generated/prisma/client';

@ApiTags('styles')
@Controller('styles')
export class StylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Get('all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener todos los estilos' })
  async getAllStyles() {
    return this.stylesService.getAll();
  }

  @Get('all/:categoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener estilos por categoría' })
  @ApiParam({
    name: 'categoryId',
    type: 'string',
    description: 'UUID de la categoría',
  })
  async getAllByGroup(@Param('categoryId') categoryId: string) {
    return this.stylesService.getAllByGroup(categoryId);
  }

  @Get('get/:uid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener estilo por UID' })
  async getById(@Param('uid') uid: string) {
    return this.stylesService.get(uid);
  }

  @Post('create')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear estilo' })
  async createStyle(
    @Body() body: CreateStyleDto,
    @Institution() institution: InstitutionModel & { subscriptionPlan: SubscriptionPlan },
  ) {
    return this.stylesService.create({
      ...body,
      institutionId: institution.uid,
    });
  }

  @Put('update/:uid')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator', 'institutional')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar estilo' })
  async updateStyle(@Param('uid') uid: string, @Body() body: UpdateStyleDto) {
    return this.stylesService.update(uid, body);
  }

  @Delete('delete/:uid')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar estilo' })
  async deleteStyle(@Param('uid') uid: string) {
    return this.stylesService.delete(uid);
  }
}
