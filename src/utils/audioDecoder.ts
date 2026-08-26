import { BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

/**
 * Decodificador de audio en base64 para la página de música.
 *
 * **Por qué no reusa el de imágenes.** `Photos.service.base64ToBuffer` hace esto
 * cuando el string no matchea su regex:
 *
 * ```ts
 * // Sin prefijo — asume jpeg por defecto
 * return { buffer: Buffer.from(base64, 'base64'), extension: 'jpeg' };
 * ```
 *
 * Ese fallback trasladado al audio significa escribir **bytes arbitrarios, con
 * extensión arbitraria, dentro de una carpeta servida públicamente**. Acá no hay
 * fallback: lo que no se reconoce se rechaza.
 */

/** Formatos aceptados. La extensión sale de acá, nunca del nombre del cliente. */
export const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

/**
 * Tope del buffer **ya decodificado**, no del string base64.
 * El body parser está en 20mb (`main.ts`), que en base64 son ~15 MB de archivo
 * real; este tope es el mismo número, aplicado del lado del servidor para que no
 * dependa del `accept` del input del navegador.
 */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

const DATA_URL = /^data:([a-z0-9.+/-]+);base64,(.+)$/i;

/**
 * Firmas de los formatos aceptados. El MIME lo declara el cliente y se puede
 * mentir; los primeros bytes del archivo, no. Sin esto, un `data:audio/mpeg`
 * pegado a un payload de HTML pasa la validación entera.
 */
function looksLikeAudio(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  const ascii = (start: number, end: number) =>
    buffer.subarray(start, end).toString('ascii');

  // MP3: tag ID3, o un frame MPEG que arranca con 0xFF 0xEx/0xFx
  if (ascii(0, 3) === 'ID3') return true;
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;

  // WAV: "RIFF"…"WAVE"
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return true;

  // OGG
  if (ascii(0, 4) === 'OggS') return true;

  // MP4 / M4A: caja "ftyp" en el offset 4
  if (ascii(4, 8) === 'ftyp') return true;

  return false;
}

export interface DecodedAudio {
  buffer: Buffer;
  extension: string;
  mime: string;
}

/**
 * Convierte un data-URL de audio en un Buffer validado.
 * Lanza `BadRequestException` ante cualquier cosa que no sea audio reconocible.
 */
export function decodeAudioBase64(base64: string): DecodedAudio {
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new BadRequestException('El audio es obligatorio');
  }

  const match = DATA_URL.exec(base64);
  if (!match) {
    // Deliberado: acá NO se asume un formato, a diferencia de las imágenes.
    throw new BadRequestException(
      'El audio debe venir como data-URL, con el formato data:<mime>;base64,<datos>',
    );
  }

  const mime = match[1].toLowerCase();
  const extension = AUDIO_MIME_EXTENSIONS[mime];
  if (!extension) {
    throw new BadRequestException(
      `Formato de audio no permitido: ${mime}. Se aceptan ${Object.keys(
        AUDIO_MIME_EXTENSIONS,
      ).join(', ')}`,
    );
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    throw new BadRequestException('El audio está vacío o mal codificado');
  }

  if (buffer.length > MAX_AUDIO_BYTES) {
    const mb = (MAX_AUDIO_BYTES / 1024 / 1024).toFixed(0);
    throw new BadRequestException(
      `El audio supera el máximo de ${mb} MB`,
    );
  }

  if (!looksLikeAudio(buffer)) {
    throw new BadRequestException(
      'El contenido del archivo no corresponde a un audio válido',
    );
  }

  return { buffer, extension, mime };
}

/**
 * Nombre con el que se guarda en disco.
 *
 * **El nombre del cliente se descarta por completo**, no se sanitiza: lo único
 * que aporta es legibilidad, y el archivo se referencia siempre por su URL. Sin
 * usarlo no hay recorrido de rutas (`../`) ni doble extensión que revisar.
 */
export function buildAudioFileName(extension: string): string {
  return `${uuidv4()}.${extension}`;
}
