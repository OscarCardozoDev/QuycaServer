import { promises as fs } from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';

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
 * renombre.
 *
 * El plan que desarrollaba esto (`docs/superpowers/plans/2026-08-25-pagina-musica.md`
 * §2.2) **se perdió**: `docs/` entero está gitignoreado y ese archivo no está
 * en ningún repo. No lo busques. El razonamiento completo que quedó es el de arriba,
 * más `obsidian/Tareas/Musica-Lo-que-falta.md`. Desde 2026-09-01 los planes van a
 * `obsidian/Raw/Planes/`, dentro del vault, justamente por esto.
 */
export const AUDIO_ROOT: MediaRoot = { dir: 'audio', urlPrefix: '/audio' };

/**
 * Las subcarpetas que el cliente puede elegir. Refuerzo de los DTOs — la barrera
 * real es `resolveFolder`, esto solo hace que el cliente no esté eligiendo un
 * directorio arbitrario en primer lugar.
 *
 * Salió de `grep -rn "folder:" QuycaClient/src`. Agregar una carpeta nueva pide
 * agregarla acá; si no, la subida devuelve 400 en vez de crear el directorio.
 */
export const MEDIA_FOLDERS = [
  'users',
  'profiles',
  'products',
  'events',
  'lessons',
] as const;

export interface SavePhotoParams {
  fileBuffer: Buffer;
  fileName: string;
  folderPath?: string; // ej: "productos/artes"
  root?: MediaRoot;
}

export interface EditPhotoParams {
  fileBuffer: Buffer;
  fileName: string;
  folderPath?: string;
  root?: MediaRoot;
}

export interface PhotoResult {
  name: string;
  url: string; // URL pública
}

export interface GetPhotoResult {
  base64: string;
}

/**
 * Resuelve una ruta física dentro de public/<root.dir>, y verifica que el
 * resultado siga estando adentro.
 *
 * Antes esto era un `path.join` pelado, y `path.join` NO es una barrera: resuelve
 * los `..` en vez de rechazarlos. Con `folderPath` llegando crudo del DTO (donde
 * solo decía `@IsString()`), una subida de foto era una escritura arbitraria de
 * archivos:
 *
 *   path.join('/app/public', 'images', '../../../../app/dist')  →  '/app/dist'
 *
 * El `SqlInjectionGuard` tampoco lo veía: `../../..` no es un patrón SQL.
 *
 * `path.resolve` + comprobación de prefijo es la forma correcta, y es una sola:
 * normaliza separadores, `.`, `..` y rutas absolutas de una vez (un `folderPath`
 * de `/etc` también se resuelve fuera de la base, y también se corta acá).
 *
 * La comparación es contra `base + path.sep` a propósito: un `startsWith(base)`
 * pelado dejaría pasar `/app/public/images-robado`, que empieza igual y es otro
 * directorio.
 */
function resolveFolder(folderPath = '', root: MediaRoot = IMAGES_ROOT): string {
  const base = path.resolve(PUBLIC_ROOT, root.dir);
  const target = path.resolve(base, folderPath);

  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new BadRequestException('Ruta de carpeta no permitida');
  }

  return target;
}

/**
 * Reduce lo que llega a un nombre de archivo, nunca una ruta.
 *
 * `save` concatena el nombre al directorio ya resuelto, así que un `name` con
 * `../` escapa igual que un `folderPath` — y el prefijo uuid que le ponen los
 * services no alcanza: absorbe un nivel, con uno más se sale
 * (`path.join(dir, 'uuid_../../../../x.js')` → `public/x.js`).
 *
 * `path.basename` es la respuesta nativa: se queda con el último segmento y
 * entiende los dos separadores. No hay que inventar un regex de nombres válidos
 * en Windows y en Linux.
 */
function safeFileName(fileName: string): string {
  const base = path.basename(fileName);

  if (!base || base === '.' || base === '..') {
    throw new BadRequestException('Nombre de archivo no permitido');
  }

  return base;
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

/**
 * El inverso de `buildPublicUrl`: de `/images/products/obra.jpeg` saca
 * `{ folderPath: 'products', fileName: 'obra.jpeg' }`.
 *
 * Existe porque `edit` y `remove` parten de `Photos.url` (lo guardado en la
 * base) y necesitan volver a una ruta física — que ahora se arma siempre con
 * `resolveFolder`, nunca concatenando la URL. El troceo estaba escrito a mano
 * dentro de `deletePhotoUseCase`; acá vive al lado de su inverso, que es donde
 * se nota si uno de los dos cambia.
 */
export function parsePublicUrl(
  url: string,
  root: MediaRoot = IMAGES_ROOT,
): { folderPath: string; fileName: string } {
  const withoutPrefix = url.startsWith(`${root.urlPrefix}/`)
    ? url.slice(root.urlPrefix.length + 1)
    : url;

  const segments = withoutPrefix.split('/').filter(Boolean);
  const fileName = segments.pop() ?? '';

  return { folderPath: segments.join('/'), fileName };
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
    const safeName = safeFileName(fileName);
    const filePath = path.join(targetDir, safeName);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(filePath, fileBuffer);

    // La URL se arma con el nombre YA saneado: si se armara con el crudo, lo que
    // se guarda en `Photos.url` no apuntaría al archivo que se acaba de escribir.
    return {
      name: safeName,
      url: buildPublicUrl(folderPath, safeName, root),
    };
  },

  /**
   * Sobrescribe una foto existente.
   *
   * Antes recibía `folderPath` y hacía `fs.writeFile(folderPath, ...)` con la ruta
   * cruda — y el único llamador le pasaba `Photos.url`, que es una URL pública
   * (`/images/products/x.jpeg`), no una ruta de disco. Así que además de ser el
   * cuarto sink sin guarda, no funcionaba: `fs.access('/images/...')` busca en la
   * raíz del sistema de archivos. Ahora toma las mismas partes que `get` y
   * `remove` y pasa por `resolveFolder`.
   */
  async edit({
    fileBuffer,
    fileName,
    folderPath = '',
    root = IMAGES_ROOT,
  }: EditPhotoParams): Promise<void> {
    const filePath = path.join(
      resolveFolder(folderPath, root),
      safeFileName(fileName),
    );

    await fs.access(filePath);
    await fs.writeFile(filePath, fileBuffer);
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
      const filePath = path.join(
        resolveFolder(folderPath, root),
        safeFileName(fileName),
      );
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
    const filePath = path.join(
      resolveFolder(folderPath, root),
      safeFileName(fileName),
    );
    await fs.unlink(filePath);
  },
};
