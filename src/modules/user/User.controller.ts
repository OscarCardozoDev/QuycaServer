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
import { Roles } from 'src/decorators/roles.decorator';

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
      'Crear perfil de profesor (solo admin) — el profesor debe haber hecho register primero',
  })
  @UseGuards(AuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async createProfessor(@Body() body: CreateProfessorDto) {
    // uid viene del body (UID de las Credentials del profesor), no del admin que hace la petición
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
  @UseGuards(AuthGuard)
  @Roles('admin', 'professor')
  @HttpCode(HttpStatus.OK)
  async getActiveUsers() {
    return this.userService.getActiveUsers();
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
  @Roles('professor', 'student')
  @HttpCode(HttpStatus.OK)
  async updateCurrentUser(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateUserDto,
  ) {
    return this.userService.updateUser(user.uid, body);
  }

  @Put(':uid')
  @ApiOperation({ summary: 'Actualizar usuario por UID (admin)' })
  @UseGuards(AuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async updateUser(@Param('uid') uid: string, @Body() body: UpdateUserDto) {
    return this.userService.updateUser(uid, body);
  }

  @Patch('photo')
  @ApiOperation({ summary: 'Actualizar foto del usuario actual' })
  @UseGuards(AuthGuard)
  @Roles('student', 'professor')
  @HttpCode(HttpStatus.OK)
  async updateCurrentUserPhoto(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateUserPhotoDto,
  ) {
    return this.userService.updateUserPhoto(user.uid, body);
  }

  @Patch(':uid/photo')
  @ApiOperation({ summary: 'Actualizar foto de usuario por UID (admin)' })
  @UseGuards(AuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async updateUserPhoto(
    @Param('uid') uid: string,
    @Body() body: UpdateUserPhotoDto,
  ) {
    return this.userService.updateUserPhoto(uid, body);
  }

  @Patch('deactivate')
  @ApiOperation({ summary: 'Desactivar usuario actual' })
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async deactivateCurrentUser(@CurrentUser() user: JwtPayload) {
    return this.userService.deactivateUser(user.uid);
  }

  @Patch(':uid/deactivate')
  @ApiOperation({ summary: 'Desactivar usuario por UID (admin)' })
  @UseGuards(AuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deactivateUser(@Param('uid') uid: string) {
    return this.userService.deactivateUser(uid);
  }

  @Patch(':uid/reactivate')
  @ApiOperation({ summary: 'Reactivar usuario (admin)' })
  @UseGuards(AuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async reactivateUser(@Param('uid') uid: string) {
    return this.userService.reactivateUser(uid);
  }
}
