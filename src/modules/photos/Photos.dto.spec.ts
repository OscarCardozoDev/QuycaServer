import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePhotoDto } from './Photos.dto';

/**
 * El borde: `folder` es un segmento de ruta en disco, no texto libre. La barrera
 * real esta en resolveFolder() (src/utils/photosManagement.ts, con su propio
 * spec); esto verifica que el 400 salga en el ValidationPipe y ni siquiera
 * llegue al service.
 */
describe('CreatePhotoDto — folder es un conjunto cerrado', () => {
  const validar = (folder: string) =>
    validateSync(
      plainToInstance(CreatePhotoDto, {
        base64: 'data:image/png;base64,iVBORw0KGgo=',
        name: 'obra.png',
        folder,
      }),
    );

  it.each(['users', 'profiles', 'products', 'events', 'lessons'])(
    'acepta %s, que es de las que usa el frontend',
    (folder) => {
      expect(validar(folder)).toHaveLength(0);
    },
  );

  it.each([
    ['sube con ..', '../../etc'],
    ['sube desde una valida', 'products/../../..'],
    ['ruta absoluta', '/etc'],
    ['separadores de windows', '..\\..\\windows'],
    ['carpeta inventada', 'shells'],
    ['vacio', ''],
  ])('rechaza %s', (_caso, folder) => {
    const errores = validar(folder);

    expect(errores).toHaveLength(1);
    expect(errores[0].property).toBe('folder');
  });
});
