import * as path from 'path';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('x')),
    unlink: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
  },
}));

import { promises as fs } from 'fs';
import {
  photoManagement,
  AUDIO_ROOT,
  IMAGES_ROOT,
} from './photosManagement';

const PUBLIC = path.join(process.cwd(), 'public');
const buffer = Buffer.from('contenido');

describe('photoManagement — media roots', () => {
  beforeEach(() => jest.clearAllMocks());

  // El contrato que no se puede romper: T2 parametrizo la raiz y el prefijo,
  // pero toda llamada que ya existia (las de imagenes) tiene que escribir y
  // devolver exactamente lo mismo que antes.
  describe('sin root explicito escribe en imagenes, como siempre', () => {
    it('guarda bajo public/images y devuelve /images/...', async () => {
      const res = await photoManagement.save({
        fileBuffer: buffer,
        fileName: 'obra.jpeg',
        folderPath: 'products',
      });

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(PUBLIC, 'images', 'products'),
        { recursive: true },
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(PUBLIC, 'images', 'products', 'obra.jpeg'),
        buffer,
      );
      expect(res.url).toBe('/images/products/obra.jpeg');
    });

    it('sin folderPath no deja doble barra en la URL', async () => {
      const res = await photoManagement.save({
        fileBuffer: buffer,
        fileName: 'suelta.png',
      });

      expect(res.url).toBe('/images/suelta.png');
    });

    it('remove borra dentro de public/images', async () => {
      await photoManagement.remove('obra.jpeg', 'products');

      expect(fs.unlink).toHaveBeenCalledWith(
        path.join(PUBLIC, 'images', 'products', 'obra.jpeg'),
      );
    });
  });

  describe('con AUDIO_ROOT escribe en su propia carpeta', () => {
    it('guarda bajo public/audio y devuelve /audio/...', async () => {
      const res = await photoManagement.save({
        fileBuffer: buffer,
        fileName: 'cancion.mp3',
        folderPath: 'products',
        root: AUDIO_ROOT,
      });

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(PUBLIC, 'audio', 'products'),
        { recursive: true },
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(PUBLIC, 'audio', 'products', 'cancion.mp3'),
        buffer,
      );
      // Esta URL se persiste en Products.audioUrl: si cambia, hace falta una
      // migracion de datos, no un renombre.
      expect(res.url).toBe('/audio/products/cancion.mp3');
    });

    it('el audio nunca cae dentro de la carpeta de imagenes', async () => {
      const res = await photoManagement.save({
        fileBuffer: buffer,
        fileName: 'cancion.mp3',
        root: AUDIO_ROOT,
      });

      expect(res.url.startsWith('/images')).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalledWith(
        expect.stringContaining(path.join('public', 'images')),
        expect.anything(),
      );
    });
  });

  it('los dos roots coinciden con su ServeStaticModule de app.module.ts', () => {
    expect(IMAGES_ROOT).toEqual({ dir: 'images', urlPrefix: '/images' });
    expect(AUDIO_ROOT).toEqual({ dir: 'audio', urlPrefix: '/audio' });
  });
});
