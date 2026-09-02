import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateEventDto, UpdateEventDto } from './Event.dto';
import { CreateChapterDto } from '../lessons/Chapter.dto';

/**
 * Los campos de URL que escribe el usuario y que se renderizan en un `<a href>`.
 *
 * React escapa el CONTENIDO de un elemento, pero NO el valor de un `href`. Con
 * `@IsString()` pelado, un coordinador podia guardar
 * `javascript:fetch('/api/...', {credentials:'include'})` como `streamingUrl`:
 * el `SqlInjectionGuard` no ve nada raro —no es un patron SQL—, queda en la
 * base, y se ejecuta en el origen de Quyca al primer clic, tambien desde la
 * pagina publica sin login. La cookie es HttpOnly, pero `apiFetch` manda
 * `credentials: 'include'`: el script actua COMO la victima contra toda la API.
 *
 * Sinks: EventDetail.tsx:310 y :321, ChapterReader.tsx:183.
 */

/** Los esquemas que no son navegables, o que ejecutan. */
const PELIGROSAS = [
  ['javascript', 'javascript:alert(1)'],
  ['javascript con mayusculas', 'JaVaScRiPt:alert(1)'],
  ['javascript con tab intercalado', 'java\tscript:alert(1)'],
  ['javascript con espacios delante', '   javascript:alert(1)'],
  ['data con HTML', 'data:text/html,<script>alert(1)</script>'],
  ['vbscript', 'vbscript:msgbox(1)'],
  ['file', 'file:///etc/passwd'],
  ['sin esquema', 'meet.google.com/abc'],
  ['texto suelto', 'proximamente'],
];

const VALIDAS = [
  'https://meet.google.com/abc-defg-hij',
  'https://www.youtube.com/watch?v=xxxx',
  'https://maps.google.com/?q=Tunja+Boyaca',
  'https://zoom.us/j/123456789?pwd=abc',
  'http://aula.usantoto.edu.co/sala-3',
];

const eventoBase = {
  name: 'Exposición Semestral',
  description: 'Obras del semestre.',
  eventType: 'EXHIBITION',
  startDate: '2026-10-15T14:00:00.000Z',
  isVirtual: true,
  createdById: 'aa35ee0c-f81a-4739-aa4c-af4cdfa820d3',
  groupIds: ['uuid-grupo-1'],
};

const erroresEvento = (campo: string, valor: unknown) =>
  validateSync(
    plainToInstance(CreateEventDto, { ...eventoBase, [campo]: valor }),
  ).filter((e) => e.property === campo);

describe('CreateEventDto — streamingUrl y locationUrl', () => {
  describe.each(['streamingUrl', 'locationUrl'])('%s', (campo) => {
    it.each(PELIGROSAS)('rechaza %s', (_caso, valor) => {
      expect(erroresEvento(campo, valor).length).toBeGreaterThan(0);
    });

    it.each(VALIDAS)('acepta %s', (valor) => {
      expect(erroresEvento(campo, valor)).toHaveLength(0);
    });
  });

  /**
   * LIMITE CONOCIDO, no un descuido: `@IsUrl` exige TLD por defecto
   * (`require_tld: true`), asi que rechaza `http://localhost:3000/sala` y
   * cualquier host de intranet sin punto (`http://aula-virtual:8080`).
   *
   * Se deja asi: un enlace de evento apunta a Meet, Zoom, YouTube o Maps, que
   * siempre tienen TLD, y la regla mas estricta corta ademas una familia de
   * entradas raras. Si alguna institucion pide un host interno, la salida es
   * `require_tld: false` en los cuatro sitios — y hay que decidirlo a
   * conciencia, no descubrirlo por un ticket.
   */
  it('rechaza un host sin TLD, incluido localhost', () => {
    expect(
      erroresEvento('streamingUrl', 'http://localhost:3000/sala').length,
    ).toBeGreaterThan(0);
    expect(
      erroresEvento('streamingUrl', 'http://aula-virtual:8080').length,
    ).toBeGreaterThan(0);
  });

  // streamingUrl usa @ValidateIf(isVirtual === true): un evento presencial no
  // tiene por que mandarlo, y eso tiene que seguir siendo cierto.
  it('un evento presencial no necesita streamingUrl', () => {
    const errores = validateSync(
      plainToInstance(CreateEventDto, {
        ...eventoBase,
        isVirtual: false,
        streamingUrl: undefined,
      }),
    );
    expect(errores.filter((e) => e.property === 'streamingUrl')).toHaveLength(
      0,
    );
  });
});

describe('UpdateEventDto — las mismas reglas', () => {
  const erroresUpdate = (campo: string, valor: unknown) =>
    validateSync(plainToInstance(UpdateEventDto, { [campo]: valor })).filter(
      (e) => e.property === campo,
    );

  it('rechaza javascript: en los dos campos', () => {
    expect(
      erroresUpdate('locationUrl', 'javascript:alert(1)').length,
    ).toBeGreaterThan(0);
    expect(
      erroresUpdate('streamingUrl', 'javascript:alert(1)').length,
    ).toBeGreaterThan(0);
  });

  it('acepta una URL normal', () => {
    expect(
      erroresUpdate('locationUrl', 'https://maps.google.com/?q=x'),
    ).toHaveLength(0);
  });
});

describe('CreateChapterDto — videoUrl', () => {
  const base = { title: 'Partes de la guitarra', contentMd: '# Hola' };
  const errores = (valor: unknown) =>
    validateSync(
      plainToInstance(CreateChapterDto, { ...base, videoUrl: valor }),
    ).filter((e) => e.property === 'videoUrl');

  it.each(PELIGROSAS)('rechaza %s', (_caso, valor) => {
    expect(errores(valor).length).toBeGreaterThan(0);
  });

  it('acepta un enlace de YouTube', () => {
    expect(errores('https://www.youtube.com/watch?v=xxxx')).toHaveLength(0);
  });

  it('sigue siendo opcional: un capitulo sin video es valido', () => {
    expect(validateSync(plainToInstance(CreateChapterDto, base))).toHaveLength(
      0,
    );
  });
});
