import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { photoManagement } from 'src/utils/photosManagement';
import { v4 as uuidv4 } from 'uuid';

import {
  CreatePhotoUseCase,
  UpdatePhotoUseCase,
  PhotoResponse,
} from './Photos.interface';

@Injectable()
export class PhotosService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────

  private base64ToBuffer(base64: string): {
    buffer: Buffer;
    extension: string;
  } {
    const match = base64.match(/^data:image\/(\w+);base64,(.+)$/);

    if (match) {
      const [, extension, data] = match;
      return {
        buffer: Buffer.from(data, 'base64'),
        extension,
      };
    }

    // Sin prefijo — asume jpeg por defecto
    return {
      buffer: Buffer.from(base64, 'base64'),
      extension: 'jpeg',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // CREATE
  // ───────────────────────────────────────────────────────────────

  async createPhotoUseCase(params: CreatePhotoUseCase): Promise<PhotoResponse> {
    const { base64, name, folder } = params;
    let fileResult: { url: string };
    const { buffer, extension } = this.base64ToBuffer(base64);

    const uid = uuidv4();
    const fileName = name.includes('.')
      ? `${uid}_${name}`
      : `${uid}_${name}.${extension}`;

    try {
      fileResult = await photoManagement.save({
        fileBuffer: buffer,
        fileName,
        folderPath: folder,
      });
    } catch {
      throw new Error('Error saving photo to storage');
    }

    const photo = await this.prisma.photos.create({
      data: {
        name: fileName,
        url: fileResult.url,
      },
    });

    return {
      uid: photo.uid,
      name: photo.name,
      url: photo.url,
    };
  }

  /* =========================
   * GET
   * ========================= */
  async getPhotoUseCase(uid: string) {
    const photo = await this.prisma.photos.findUnique({
      where: { uid },
    });

    if (!photo || !photo.url) {
      throw new NotFoundException('Photo not found');
    }

    return {
      uid: photo.uid,
      name: photo.name,
      url: photo.url,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // UPDATE
  // ───────────────────────────────────────────────────────────────

  async updatePhotoUseCase(
    photoId: string,
    params: UpdatePhotoUseCase,
  ): Promise<PhotoResponse> {
    const photo = await this.prisma.photos.findUnique({
      where: { uid: photoId },
    });

    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    const { buffer } = this.base64ToBuffer(params.base64);

    await photoManagement.edit({
      fileBuffer: buffer,
      folderPath: photo.url,
    });

    return {
      uid: photo.uid,
      name: photo.name,
      url: photo.url,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // DELETE
  // ───────────────────────────────────────────────────────────────

  async deletePhotoUseCase(photoId: string): Promise<void> {
    const photo = await this.prisma.photos.findUnique({
      where: { uid: photoId },
      select: { url: true },
    });

    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    // Quitar el primer "/images" si existe
    const cleanPath = photo.url.replace(/^\/images\//, '');
    const segments = cleanPath.split('/').filter(Boolean);
    const fileName = segments.pop()!;
    const folderPath = segments.join('/');

    await photoManagement.remove(fileName, folderPath);

    await this.prisma.photos.delete({
      where: { uid: photoId },
    });
  }
}
