import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateStudentDto, UpdateUserDto } from './User.dto';

/**
 * Los campos de identidad, que hasta el 2026-09-01 eran `@IsString()` pelado.
 *
 * Los casos de ACEPTACION importan tanto como los de rechazo, y por eso van
 * primero: un regex demasiado estricto no es una medida de seguridad, es un bug
 * que le impide a alguien escribir su propio apellido. Este proyecto es para
 * instituciones colombianas — la ñ no es un caso borde, es el caso normal.
 */

const base = {
  name: 'Juan',
  lastName: 'Peña',
  username: 'juan.pena',
  gender: 'M',
  telNumber: '3001234567',
  roleData: { career: 'Artes', semester: '5' },
};

/** Errores del DTO completo, acotados a un campo. */
const erroresDe = (campo: string, valor: unknown) =>
  validateSync(
    plainToInstance(CreateStudentDto, { ...base, [campo]: valor }),
  ).filter((e) => e.property === campo);

const acepta = (campo: string, valor: unknown) =>
  expect(erroresDe(campo, valor)).toHaveLength(0);

const rechaza = (campo: string, valor: unknown) =>
  expect(erroresDe(campo, valor).length).toBeGreaterThan(0);

describe('name / lastName — Unicode, no ASCII', () => {
  describe('acepta los nombres que la gente tiene de verdad', () => {
    it.each([
      ['la ñ, que es el motivo de que esto no sea ASCII', 'Peña'],
      ['otra con ñ', 'Muñoz'],
      ['y otra', 'Nuñez'],
      ['la Ñ mayuscula, que es otro code point (U+00D1)', 'PEÑA'],
      // La misma ñ escrita como dos code points: n + U+0303. Asi llega desde
      // macOS. Es lo que cubre \p{M}; sin el, este caso se rechazaba.
      ['la ñ descompuesta en NFD (n + U+0303)', 'Peña'.normalize('NFD')],
      ['tilde y ñ en la misma cadena', 'Ibáñez'],
      ['ñ inicial', 'Ñandú'],
      ['espacios internos', 'Begoña Ochoa'],
      ['apellido compuesto', 'de la Cruz'],
      ['apostrofo', "O'Brien"],
      ['diereses y cedilla', 'Nathalie Küçük'],
      ['guion', 'García-López'],
    ])('acepta %s: %s', (_caso, valor) => {
      acepta('name', valor);
      acepta('lastName', valor);
    });
  });

  describe('rechaza lo que no es un nombre', () => {
    it.each([
      ['etiqueta HTML', 'Juan<b>'],
      ['intento de SQL', 'admin; DROP TABLE'],
      ['traversal', '../../etc'],
      ['una sola letra', 'a'],
      ['mas de 30', 'x'.repeat(31)],
      ['digitos', 'Juan123'],
      ['vacio', ''],
    ])('rechaza %s', (_caso, valor) => {
      rechaza('name', valor);
    });
  });

  /**
   * Comprobado quitando cada pieza del regex (`src/common/validation.ts`):
   *
   *   sin `\p{M}`  -> falla SOLO el caso NFD de arriba
   *   sin la bandera `u` -> la suite entera deja de correr
   *
   * O sea que las dos piezas estan sostenidas por algo. Este caso es el
   * resumen: acepta lo no-ASCII y sigue cortando lo que no es un nombre.
   */
  it('sigue aceptando lo no-ASCII y cortando lo que no es un nombre', () => {
    acepta('name', 'Peña');
    rechaza('name', 'Juan<b>');
  });
});

describe('username — ASCII a proposito', () => {
  it.each(['juanperez', 'juan.pena', 'juan_pena', 'juan-99', 'abc'])(
    'acepta %s',
    (valor) => acepta('username', valor),
  );

  it.each([
    ['traversal', '../../etc'],
    ['etiqueta HTML', 'admin<script>'],
    ['espacio', 'juan perez'],
    ['menos de 3', 'ab'],
    ['mas de 30', 'x'.repeat(31)],
    ['arroba', 'juan@pena'],
    ['barra', 'juan/pena'],
  ])('rechaza %s', (_caso, valor) => rechaza('username', valor));

  /**
   * Decision del 2026-09-01: el username NO admite ñ aunque el nombre si.
   * Aparece en URLs publicas, donde `peña` se percent-encodea a `pe%C3%B1a` y
   * el enlace deja de ser legible al copiarlo.
   *
   * Si algun dia se decide al reves, hay que migrar: la columna es @unique.
   */
  it('no admite ñ, y es deliberado — ver Decisiones/Validacion-de-Entradas', () => {
    rechaza('username', 'peña');
    acepta('name', 'Peña');
  });
});

describe('gender — conjunto cerrado', () => {
  it.each(['M', 'F', 'O'])('acepta %s', (v) => acepta('gender', v));
  it.each(['X', 'masculino', '', 'M; DROP'])('rechaza %s', (v) =>
    rechaza('gender', v),
  );
});

describe('telNumber — solo digitos', () => {
  it.each(['3001234567', '+573001234567', '6017890'])('acepta %s', (v) =>
    acepta('telNumber', v),
  );
  it.each([
    ['letras', '300-CALL-ME'],
    ['muy corto', '123456'],
    ['mas de 12 digitos', '1234567890123'],
    ['inyeccion', "300' OR '1'='1"],
  ])('rechaza %s', (_caso, v) => rechaza('telNumber', v));
});

describe('description — tope de tamaño, sin lista blanca', () => {
  // Texto libre: filtrar caracteres aca rompe "Guitarra & Bajo" y no protege
  // de nada que React y Prisma no cubran ya. Solo lleva tope.
  it('acepta texto con simbolos', () =>
    acepta('description', 'Estudiante de artes & música — 50 % becado'));

  it('acepta 500, el largo de la columna', () =>
    acepta('description', 'x'.repeat(500)));

  it('rechaza 501', () => rechaza('description', 'x'.repeat(501)));
});

describe('UpdateUserDto aplica las mismas reglas', () => {
  const erroresUpdate = (campo: string, valor: unknown) =>
    validateSync(plainToInstance(UpdateUserDto, { [campo]: valor })).filter(
      (e) => e.property === campo,
    );

  it('acepta Peña y rechaza el traversal', () => {
    expect(erroresUpdate('lastName', 'Peña')).toHaveLength(0);
    expect(erroresUpdate('username', '../../etc').length).toBeGreaterThan(0);
  });

  it('sin campos no da error: todo es opcional', () => {
    expect(validateSync(plainToInstance(UpdateUserDto, {}))).toHaveLength(0);
  });
});
