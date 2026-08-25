import {
  Body,
  Controller,
  Param,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PhotosService } from './Photos.service';
import { CreatePhotoDto, UpdatePhotoDto, PhotoParamsDto } from './Photos.dto';
import { AuthGuard } from 'src/guards/jwt.guard';

@ApiTags('photos')
@Controller('photos')
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get('get/:uid')
  @ApiOperation({ summary: 'Obtener foto por UID' })
  async getPhoto(@Param() params: PhotoParamsDto) {
    return this.photosService.getPhotoUseCase(params.uid);
  }

  // `AuthGuard` agregado el 2026-08-25: escribir una foto era anónimo. Cualquiera
  // podía crear filas y, con `edit/:uid`, sobrescribir la foto de otra persona.
  // Alcanza con exigir sesión: la foto sola no dice de quién es --se ata a una
  // obra, a una lección o a un evento por la tabla puente-- así que el rol lo
  // pone el endpoint que la consume, no éste.
  // Ver obsidian/Raw/Specs/2026-08-23-matriz-de-permisos-design.md §3.11.
  @Post('create')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Crear foto' })
  async createPhoto(@Body() body: CreatePhotoDto) {
    return this.photosService.createPhotoUseCase(body);
  }

  @Put('edit/:uid')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Actualizar foto' })
  async updatePhoto(
    @Param() params: PhotoParamsDto,
    @Body() body: UpdatePhotoDto,
  ) {
    return this.photosService.updatePhotoUseCase(params.uid, body);
  }
}
