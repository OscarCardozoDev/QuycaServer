import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Carpeta raíz de imágenes públicas
 * Coincide con ServeStaticModule
 */
const IMAGES_ROOT = path.join(process.cwd(), 'public', 'images');

export interface SavePhotoParams {
  fileBuffer: Buffer;
  fileName: string;
  folderPath?: string; // ej: "productos/artes"
}

export interface EditPhotoParams {
  fileBuffer: Buffer;
  folderPath?: string;
}

export interface PhotoResult {
  name: string;
  url: string; // URL pública
}

export interface GetPhotoResult {
  base64: string;
}

/**
 * Resuelve una ruta física dentro de public/images
 */
function resolveFolder(folderPath = ''): string {
  return path.join(IMAGES_ROOT, folderPath);
}

/**
 * Convierte ruta relativa en URL pública
 */
function buildPublicUrl(folderPath = '', fileName: string): string {
  const cleanPath = folderPath.replace(/\\/g, '/');
  return `/images/${cleanPath}/${fileName}`.replace(/\/+/g, '/');
}

export const photoManagement = {
  /**
   * Guarda una foto en public/images/(path)
   */
  async save({
    fileBuffer,
    fileName,
    folderPath = '',
  }: SavePhotoParams): Promise<PhotoResult> {
    const targetDir = resolveFolder(folderPath);
    const filePath = path.join(targetDir, fileName);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(filePath, fileBuffer);

    return {
      name: fileName,
      url: buildPublicUrl(folderPath, fileName),
    };
  },

  /**
   * Sobrescribe una foto existente
   */
  async edit({ fileBuffer, folderPath }: EditPhotoParams): Promise<void> {
    if (!folderPath) {
      throw new Error('folderPath is required');
    }

    await fs.access(folderPath);
    await fs.writeFile(folderPath, fileBuffer);
  },

  /**
   * Obtiene una foto y la devuelve en base64 (solo si la necesitas)
   */
  async get(fileName: string, folderPath = ''): Promise<GetPhotoResult | null> {
    try {
      const filePath = path.join(resolveFolder(folderPath), fileName);
      const buffer = await fs.readFile(filePath);

      return {
        base64: buffer.toString('base64'),
      };
    } catch {
      return null;
    }
  },

  /**
   * Elimina una foto
   */
  async remove(fileName: string, folderPath = ''): Promise<void> {
    const filePath = path.join(resolveFolder(folderPath), fileName);
    await fs.unlink(filePath);
  },
};
