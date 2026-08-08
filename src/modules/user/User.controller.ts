// server/src/modules/user/User.controller.ts
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Post,
  Put,
  Patch,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from 'src/decorators/currentUser';
import { UserService } from './User.service';
import {
  CreateStudentDto,
  CreateProfessorDto,
  UpdateUserDto,
  UpdateUserPhotoDto,
} from './User.dto';
import type { JwtPayload } from 'src/interface/jwtPayload';
import { AuthGuard } from 'src/middleware/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Institution } from 'src/decorators/institution.decorator';

@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('create')
  @ApiOperation({ summary: 'Crear perfil de estudiante' })
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Body() body: CreateStudentDto,
    @CurrentUser('uid') uid: string,
  ) {
    return this.userService.createStudentUseCase({
      uid,
      user: {
        name: body.name,
        lastName: body.lastName,
        username: body.username,
        description: body.description,
        gender: body.gender,
        telNumber: body.telNumber,
        roleId: body.roleId,
        roleData: body.roleData,
      },
      photo: body.photo,
    });
  }

  @Post('professor')
  @ApiOperation({
    summary:
      'Crear perfil de profesor (solo rector/coordinador) — el profesor debe haber hecho register primero',
  })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @HttpCode(HttpStatus.CREATED)
  async createProfessor(@Body() body: CreateProfessorDto) {
    // uid viene del body (UID de las Credentials del profesor), no del admin que hace la petición.
    // No hay membresía de destino que validar: este flujo SIEMPRE otorga el rol
    // 'independent' en quyca-platform, no en la institución activa del llamador — ver
    // Task 11 report, Finding A / createProfessor, para la limitación conocida.
    return this.userService.createProfessorUseCase({
      uid: body.uid,
      user: {
        name: body.name,
        lastName: body.lastName,
        username: body.username,
        description: body.description,
        gender: body.gender,
        telNumber: body.telNumber,
      },
      photo: body.photo,
    });
  }

  @Get('allActive')
  @ApiOperation({ summary: 'Obtener todos los usuarios activos' })
  @UseGuards(AuthGuard, TenantGuard)
  @HttpCode(HttpStatus.OK)
  async getActiveUsers(@Institution() institution: { uid: string }) {
    return this.userService.getActiveUsers(institution.uid);
  }

  @Get('me')
  @ApiOperation({ summary: 'Obtener usuario actual' })
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async getCurrentUser(@CurrentUser() user: JwtPayload) {
    return this.userService.getMe(user.uid);
  }

  @Get('author/:uid')
  @ApiOperation({ summary: 'Obtener información del usuario como autor' })
  @HttpCode(HttpStatus.OK)
  async getInfoAuthor(@Param('uid') uid: string) {
    return this.userService.getInfoAuthor(uid);
  }

  @Get(':uid')
  @ApiOperation({ summary: 'Obtener usuario por UID' })
  @HttpCode(HttpStatus.OK)
  async getUser(@Param('uid') uid: string) {
    return this.userService.getUser(uid);
  }

  @Put('update')
  @ApiOperation({ summary: 'Actualizar usuario actual' })
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateCurrentUser(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateUserDto,
  ) {
    return this.userService.updateOwnUser(user.uid, body);
  }

  @Put(':uid')
  @ApiOperation({ summary: 'Actualizar usuario por UID (rector/coordinador de su institución)' })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Param('uid') uid: string,
    @Body() body: UpdateUserDto,
    @Institution() institution: { uid: string },
  ) {
    return this.userService.updateUserAsAdmin(uid, body, institution.uid);
  }

  @Patch('photo')
  @ApiOperation({ summary: 'Actualizar foto del usuario actual' })
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateCurrentUserPhoto(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateUserPhotoDto,
  ) {
    return this.userService.updateOwnUserPhoto(user.uid, body);
  }

  @Patch(':uid/photo')
  @ApiOperation({ summary: 'Actualizar foto de usuario por UID (rector/coordinador de su institución)' })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @HttpCode(HttpStatus.OK)
  async updateUserPhoto(
    @Param('uid') uid: string,
    @Body() body: UpdateUserPhotoDto,
    @Institution() institution: { uid: string },
  ) {
    return this.userService.updateUserPhotoAsAdmin(uid, body, institution.uid);
  }

  @Patch('deactivate')
  @ApiOperation({ summary: 'Desactivar usuario actual' })
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async deactivateCurrentUser(@CurrentUser() user: JwtPayload) {
    return this.userService.deactivateOwnUser(user.uid);
  }

  @Patch(':uid/deactivate')
  @ApiOperation({ summary: 'Desactivar usuario por UID (rector/coordinador de su institución)' })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @HttpCode(HttpStatus.OK)
  async deactivateUser(
    @Param('uid') uid: string,
    @Institution() institution: { uid: string },
  ) {
    return this.userService.deactivateUserAsAdmin(uid, institution.uid);
  }

  @Patch(':uid/reactivate')
  @ApiOperation({ summary: 'Reactivar usuario (rector/coordinador de su institución)' })
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('rector', 'coordinator')
  @HttpCode(HttpStatus.OK)
  async reactivateUser(
    @Param('uid') uid: string,
    @Institution() institution: { uid: string },
  ) {
    return this.userService.reactivateUserAsAdmin(uid, institution.uid);
  }
}
