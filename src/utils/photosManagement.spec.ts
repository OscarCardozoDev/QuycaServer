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
import { BadRequestException } from '@nestjs/common';
import {
  photoManagement,
  parsePublicUrl,
  AUDIO_ROOT,
  IMAGES_ROOT,
  MEDIA_FOLDERS,
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

/**
 * El agujero que cerro esta rama: `folder` y `name` llegaban crudos del DTO a un
 * `path.join`, y `path.join` RESUELVE los `..` en vez de rechazarlos. Un
 * `POST /photos` con folder `../../../../app/dist` escribia fuera de public/.
 *
 * Cada caso de abajo escapaba antes de este fix.
 */
describe('photoManagement — no se puede escribir fuera de public/', () => {
  beforeEach(() => jest.clearAllMocks());

  const IMAGES = path.join(PUBLIC, 'images');

  describe('folderPath', () => {
    it.each([
      ['sube con ..', '../../etc'],
      ['sube desde una subcarpeta valida', 'products/../../..'],
      ['ruta absoluta posix', '/etc'],
      ['separadores de windows', '..\\..\\windows'],
      ['muchos niveles', '../../../../app/dist'],
    ])('rechaza %s', async (_caso, folderPath) => {
      await expect(
        photoManagement.save({
          fileBuffer: buffer,
          fileName: 'x.js',
          folderPath,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    // Un startsWith(base) pelado dejaria pasar esto: empieza igual y es otro
    // directorio.
    it('rechaza una carpeta hermana con el mismo prefijo', async () => {
      await expect(
        photoManagement.save({
          fileBuffer: buffer,
          fileName: 'x.js',
          folderPath: '../images-robado',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('el rechazo llega antes de tocar el disco, no despues', async () => {
      await expect(
        photoManagement.remove('x.jpeg', '../../etc'),
      ).rejects.toThrow(BadRequestException);
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('fileName', () => {
    // El prefijo uuid que ponen los services absorbe UN nivel y nada mas:
    // path.join(dir, 'uuid_../../../../x.js') daba public/x.js.
    it('un nombre con ../ se reduce a su ultimo segmento', async () => {
      const res = await photoManagement.save({
        fileBuffer: buffer,
        fileName: 'uuid_../../../../shell.js',
        folderPath: 'products',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(IMAGES, 'products', 'shell.js'),
        buffer,
      );
      // La URL guardada tiene que apuntar al archivo que se escribio, no al
      // nombre crudo: si no, Photos.url queda mintiendo.
      expect(res.url).toBe('/images/products/shell.js');
      expect(res.name).toBe('shell.js');
    });

    it('rechaza un nombre que no deja ningun segmento', async () => {
      await expect(
        photoManagement.save({
          fileBuffer: buffer,
          fileName: '..',
          folderPath: 'products',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('lo legitimo sigue funcionando', () => {
    it('una subcarpeta anidada normal pasa', async () => {
      const res = await photoManagement.save({
        fileBuffer: buffer,
        fileName: 'obra.jpeg',
        folderPath: 'products/artes',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(IMAGES, 'products', 'artes', 'obra.jpeg'),
        buffer,
      );
      expect(res.url).toBe('/images/products/artes/obra.jpeg');
    });

    it('sin folderPath escribe en la raiz del root, que es adentro', async () => {
      const res = await photoManagement.save({
        fileBuffer: buffer,
        fileName: 'suelta.png',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(IMAGES, 'suelta.png'),
        buffer,
      );
      expect(res.url).toBe('/images/suelta.png');
    });

    it('las carpetas que usa el frontend estan todas permitidas', async () => {
      for (const folder of MEDIA_FOLDERS) {
        await expect(
          photoManagement.save({
            fileBuffer: buffer,
            fileName: 'ok.jpeg',
            folderPath: folder,
          }),
        ).resolves.toBeDefined();
      }
    });
  });
});

/**
 * `edit` era el cuarto sink y ademas no funcionaba: recibia `Photos.url`
 * (`/images/products/x.jpeg`) y hacia `fs.writeFile` con eso como ruta de disco,
 * o sea contra la raiz del sistema de archivos.
 */
describe('photoManagement.edit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('escribe dentro de public/images, no en la raiz del filesystem', async () => {
    const { folderPath, fileName } = parsePublicUrl('/images/products/x.jpeg');

    await photoManagement.edit({ fileBuffer: buffer, fileName, folderPath });

    const esperado = path.join(PUBLIC, 'images', 'products', 'x.jpeg');
    expect(fs.access).toHaveBeenCalledWith(esperado);
    expect(fs.writeFile).toHaveBeenCalledWith(esperado, buffer);
  });

  it('rechaza una carpeta que se sale', async () => {
    await expect(
      photoManagement.edit({
        fileBuffer: buffer,
        fileName: 'x.jpeg',
        folderPath: '../../etc',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('parsePublicUrl — el inverso de buildPublicUrl', () => {
  it.each([
    ['/images/products/obra.jpeg', 'products', 'obra.jpeg'],
    ['/images/products/artes/obra.jpeg', 'products/artes', 'obra.jpeg'],
    ['/images/suelta.png', '', 'suelta.png'],
  ])('%s', (url, folderPath, fileName) => {
    expect(parsePublicUrl(url)).toEqual({ folderPath, fileName });
  });

  it('con AUDIO_ROOT quita su propio prefijo', () => {
    expect(parsePublicUrl('/audio/products/cancion.mp3', AUDIO_ROOT)).toEqual({
      folderPath: 'products',
      fileName: 'cancion.mp3',
    });
  });

  // La propiedad que importa: lo que sale de save() tiene que poder volver a
  // entrar en remove() y dar la misma ruta.
  it('ida y vuelta con lo que devuelve save()', async () => {
    const res = await photoManagement.save({
      fileBuffer: buffer,
      fileName: 'obra.jpeg',
      folderPath: 'products/artes',
    });

    expect(parsePublicUrl(res.url)).toEqual({
      folderPath: 'products/artes',
      fileName: 'obra.jpeg',
    });
  });
});
