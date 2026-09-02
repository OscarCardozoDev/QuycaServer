import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateGroupDto } from 'src/modules/groups/Group.dto';
import { CreateChapterDto } from 'src/modules/lessons/Chapter.dto';
import { ReviewLessonDto } from 'src/modules/lessons/Lesson.dto';
import {
  CreateContentRequestDto,
  ReviewContentRequestDto,
} from 'src/modules/categories/Categories.dto';
import { LoginDto } from 'src/modules/auth/Auth.dto';
import {
  MAX_CONTENIDO_MD,
  MAX_REGLAS,
  MAX_TEXTO_LARGO,
  MAX_PASSWORD,
} from './validation';

/**
 * Los topes de tamaño.
 *
 * Hasta el 2026-09-01 el unico freno era `bodyParser.json({ limit: '20mb' })`
 * en main.ts, y debajo habia dos problemas distintos:
 *
 *  1. SEIS columnas `@db.Text` sin limite NI en el esquema NI en el DTO
 *     (`Groups.rules`, `Chapters.contentMd`, `ContentRequest.justification` y
 *     `.reviewNote`, `Lessons.institutionFeedback` y `.globalFeedback`). Un
 *     `rules` de 20 MB quedaba en Postgres para siempre; repetido en un `for`,
 *     llena el disco de la VM. No hace falta ser habil, hace falta un bucle.
 *
 *  2. El resto SI tenia `@db.VarChar(n)` en el esquema, pero el DTO no repetia
 *     el limite. Postgres corta igual, pero el error llega desde el driver como
 *     500 en vez de 400: el usuario ve "error del servidor" por haber escrito un
 *     nombre largo, y el log se llena de excepciones que parecen una caida.
 *
 * De ahi la regla: el numero va en el DTO, igual al del esquema.
 */

const largo = (n: number) => 'x'.repeat(n);

/** Errores de `campo` al validar `Dto` con `base` mas ese campo. */
const errores = (
  Dto: new () => object,
  base: Record<string, unknown>,
  campo: string,
  valor: unknown,
) =>
  validateSync(plainToInstance(Dto, { ...base, [campo]: valor })).filter(
    (e) => e.property === campo,
  );

describe('columnas @db.Text — sin tope en la base, con tope en el DTO', () => {
  const casos: [
    string,
    new () => object,
    Record<string, unknown>,
    string,
    number,
  ][] = [
    [
      'Groups.rules',
      CreateGroupDto,
      { name: 'Grupo A', categoryId: 'uuid-cat' },
      'rules',
      MAX_REGLAS,
    ],
    [
      'Chapters.contentMd',
      CreateChapterDto,
      { title: 'Capitulo 1' },
      'contentMd',
      MAX_CONTENIDO_MD,
    ],
    [
      'ContentRequest.justification',
      CreateContentRequestDto,
      { type: 'CATEGORY', requestedName: 'Ceramica' },
      'justification',
      MAX_TEXTO_LARGO,
    ],
    [
      'ContentRequest.reviewNote',
      ReviewContentRequestDto,
      { approved: true },
      'reviewNote',
      MAX_TEXTO_LARGO,
    ],
    [
      'Lessons.institutionFeedback / globalFeedback',
      ReviewLessonDto,
      { approve: false },
      'feedback',
      MAX_TEXTO_LARGO,
    ],
  ];

  it.each(casos)('%s acepta el tope justo', (_n, Dto, base, campo, tope) => {
    expect(errores(Dto, base, campo, largo(tope))).toHaveLength(0);
  });

  it.each(casos)('%s rechaza uno mas', (_n, Dto, base, campo, tope) => {
    expect(errores(Dto, base, campo, largo(tope + 1)).length).toBeGreaterThan(
      0,
    );
  });

  // El caso que motivo todo: 20 MB entraban y se guardaban.
  it.each(casos)('%s rechaza 20 MB', (_n, Dto, base, campo) => {
    expect(
      errores(Dto, base, campo, largo(20 * 1024 * 1024)).length,
    ).toBeGreaterThan(0);
  });
});

describe('columnas VarChar — el 400 lo da Nest, no el driver', () => {
  const casos: [
    string,
    new () => object,
    Record<string, unknown>,
    string,
    number,
  ][] = [
    ['Groups.name', CreateGroupDto, { categoryId: 'uuid-cat' }, 'name', 100],
    ['Chapters.title', CreateChapterDto, { contentMd: '# x' }, 'title', 120],
    [
      'ContentRequest.requestedName',
      CreateContentRequestDto,
      { type: 'STYLE' },
      'requestedName',
      100,
    ],
  ];

  it.each(casos)(
    '%s acepta el largo de la columna',
    (_n, Dto, base, campo, tope) => {
      expect(errores(Dto, base, campo, largo(tope))).toHaveLength(0);
    },
  );

  it.each(casos)('%s rechaza uno mas', (_n, Dto, base, campo, tope) => {
    expect(errores(Dto, base, campo, largo(tope + 1)).length).toBeGreaterThan(
      0,
    );
  });
});

/**
 * `bcryptjs` trunca en 72 bytes EN SILENCIO. Sin tope, una contraseña de 80
 * caracteres funciona con los primeros 72 y el usuario nunca se entera de que
 * los ultimos 8 no cuentan — ni de que su contraseña es mas corta de lo que
 * cree. El limite convierte eso en un mensaje.
 */
describe('password — el tope es el de bcrypt, no el de la columna', () => {
  const base = { mail: 'artista@gmail.com' };

  it('acepta 72', () => {
    expect(
      errores(LoginDto, base, 'password', largo(MAX_PASSWORD)),
    ).toHaveLength(0);
  });

  it('rechaza 73, en vez de truncar sin avisar', () => {
    expect(
      errores(LoginDto, base, 'password', largo(MAX_PASSWORD + 1)).length,
    ).toBeGreaterThan(0);
  });

  it('sigue exigiendo el minimo de 6', () => {
    expect(
      errores(LoginDto, base, 'password', largo(5)).length,
    ).toBeGreaterThan(0);
  });
});
