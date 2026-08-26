import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Raíz de los archivos públicos: `public/`.
 * Cada media root cuelga de acá y tiene su propio `ServeStaticModule` en `app.module.ts`.
 */
const PUBLIC_ROOT = path.join(process.cwd(), 'public');

/**
 * Un destino de archivos: la carpeta dentro de `public/` y el prefijo con el que
 * se sirve. Los dos tienen que coincidir con su `ServeStaticModule.forRoot`.
 */
export interface MediaRoot {
  dir: string;
  urlPrefix: string;
}

/** Imágenes — el destino histórico y el default de todas las funciones. */
export const IMAGES_ROOT: MediaRoot = { dir: 'images', urlPrefix: '/images' };

/**
 * Audio — agregado para la página de música (MVP 2026-08-25).
 *
 * Va en su propia carpeta y no en `public/images/audio/`, que habría costado cero
 * líneas: la URL que sale de acá **se persiste** en `Products.audioUrl`, así que
 * un prefijo equivocado se arregla después con una migración de datos y no con un
 * renombre. Ver `docs/superpowers/plans/2026-08-25-pagina-musica.md` §2.2.
 */
export const AUDIO_ROOT: MediaRoot = { dir: 'audio', urlPrefix: '/audio' };

export interface SavePhotoParams {
  fileBuffer: Buffer;
  fileName: string;
  folderPath?: string; // ej: "productos/artes"
  root?: MediaRoot;
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
 * Resuelve una ruta física dentro de public/<root.dir>
 */
function resolveFolder(folderPath = '', root: MediaRoot = IMAGES_ROOT): string {
  return path.join(PUBLIC_ROOT, root.dir, folderPath);
}

/**
 * Convierte ruta relativa en URL pública
 */
function buildPublicUrl(
  folderPath = '',
  fileName: string,
  root: MediaRoot = IMAGES_ROOT,
): string {
  const cleanPath = folderPath.replace(/\\/g, '/');
  return `${root.urlPrefix}/${cleanPath}/${fileName}`.replace(/\/+/g, '/');
}

export const photoManagement = {
  /**
   * Guarda un archivo en public/<root.dir>/(path).
   * Sin `root` escribe en `public/images`, que es el comportamiento de siempre.
   */
  async save({
    fileBuffer,
    fileName,
    folderPath = '',
    root = IMAGES_ROOT,
  }: SavePhotoParams): Promise<PhotoResult> {
    const targetDir = resolveFolder(folderPath, root);
    const filePath = path.join(targetDir, fileName);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(filePath, fileBuffer);

    return {
      name: fileName,
      url: buildPublicUrl(folderPath, fileName, root),
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
   * Obtiene un archivo y lo devuelve en base64 (solo si lo necesitas)
   */
  async get(
    fileName: string,
    folderPath = '',
    root: MediaRoot = IMAGES_ROOT,
  ): Promise<GetPhotoResult | null> {
    try {
      const filePath = path.join(resolveFolder(folderPath, root), fileName);
      const buffer = await fs.readFile(filePath);

      return {
        base64: buffer.toString('base64'),
      };
    } catch {
      return null;
    }
  },

  /**
   * Elimina un archivo
   */
  async remove(
    fileName: string,
    folderPath = '',
    root: MediaRoot = IMAGES_ROOT,
  ): Promise<void> {
    const filePath = path.join(resolveFolder(folderPath, root), fileName);
    await fs.unlink(filePath);
  },
};
