/**
 * Las reglas de validación que usan MÁS DE UN DTO.
 *
 * Existe para que no haya ocho copias del mismo regex: `name` está en
 * `User.dto` y en `Institution.dto` (representante), el slug en
 * `Institution.dto` y en `Categories.dto`, la hora en `Schedule.dto` y en
 * `Classes.dto`. Un regex de seguridad duplicado a mano es un regex que se
 * desincroniza.
 *
 * Regla del proyecto: **lista blanca, nunca lista negra**. Una lista negra se
 * rodea; una blanca no. Ver `obsidian/Decisiones/Validacion-de-Entradas.md`.
 */

/**
 * Nombre y apellido de una persona.
 *
 * Unicode y NO ASCII, a propósito. `^[a-zA-Z ]+$` le impide a un Peña, a un
 * Muñoz o a un Ibáñez escribir su propio apellido — y este proyecto es para
 * instituciones colombianas.
 *
 *   \p{L} — cualquier letra: ñ, Ñ, á, ü, ç. Es lo que hace que la ñ pase.
 *   \p{M} — marcas combinantes: la ñ también llega DESCOMPUESTA (n + U+0303)
 *           desde macOS, y ahí son dos code points, no uno.
 *
 * La bandera `u` del final no es decorativa: sin ella `\p{L}` no significa
 * nada y el regex deja de validar. Si alguien la borra, `User.dto.spec.ts` se
 * pone rojo.
 */
export const NOMBRE_PERSONA = /^[\p{L}\p{M}'\- ]{2,30}$/u;
export const NOMBRE_PERSONA_MSG =
  'Admite letras (incluidas ñ y tildes), apóstrofo, guion y espacios, de 2 a 30 caracteres';

/**
 * Nombre de usuario. ASCII **a propósito**, decidido el 2026-09-01.
 *
 * Aparece en URLs públicas, donde una ñ se percent-encodea a `%C3%B1` y el
 * enlace deja de ser legible al copiarlo. El nombre real de la persona —lo que
 * se muestra en la UI— sí acepta ñ, arriba.
 *
 * Cambiar esto implica migrar datos: la columna es `@unique`.
 */
export const USERNAME = /^[a-zA-Z0-9._-]{3,30}$/;
export const USERNAME_MSG =
  'Admite letras sin tilde, números, punto, guion y guion bajo, de 3 a 30 caracteres';

/**
 * Slug de institución o de categoría.
 *
 * El de institución es el más delicado de todos los campos del proyecto: viaja
 * en el header `X-Institution-Slug` y es lo que el `TenantGuard` usa para
 * resolver el tenant. Minúsculas, números y guiones internos; no puede empezar
 * ni terminar en guion.
 */
export const SLUG = /^[a-z0-9]([a-z0-9-]{1,48})[a-z0-9]$/;
export const SLUG_MSG =
  'Admite minúsculas, números y guiones internos, de 3 a 50 caracteres';

/**
 * Los valores de `Users.gender`. La columna es `VarChar(3)`.
 *
 * `N/A` NO es relleno: lo escribe el servidor al crear el rector en
 * `Institution.service.ts:81`, porque el alta de una institución no le pregunta
 * el género a su representante. Con 'M','F','O' solamente, este `@IsIn`
 * rechazaba a 5 de los 7 usuarios de la base de desarrollo — todos los rectores
 * — la primera vez que tocaran su perfil.
 *
 * Lo encontró la consulta de revisión de datos de la Fase 3 del plan, corrida
 * ANTES de mergear. Es exactamente para lo que existe esa fase: una lista
 * blanca escrita mirando el formulario y no la base deja gente afuera.
 */
export const GENEROS = ['M', 'F', 'O', 'N/A'] as const;

/** Hora del día en formato de 24 horas. Antes `'DROP TABLE'` era una hora válida. */
export const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const HORA_HHMM_MSG = 'Formato HH:MM en 24 horas';

/** Teléfono: solo dígitos, con un `+` opcional adelante. La columna es VarChar(12). */
export const TELEFONO = /^\+?\d{7,12}$/;
export const TELEFONO_MSG = 'De 7 a 12 dígitos, opcionalmente con + adelante';

/**
 * Techos de las columnas `@db.Text`, que en Postgres NO tienen límite.
 *
 * Sin esto, `bodyParser.json({ limit: '20mb' })` era el único freno: un `rules`
 * de 20 MB quedaba en la base para siempre y, repetido en un `for`, llena el
 * disco de la VM.
 *
 * Los números son deliberadamente generosos — la idea es cortar el abuso, no
 * discutirle el estilo a un docente. Si alguno molesta en uso real, se sube.
 */
export const MAX_CONTENIDO_MD = 100_000;
export const MAX_REGLAS = 5_000;
export const MAX_TEXTO_LARGO = 2_000;

/**
 * Tope de la contraseña **en claro** (la columna guarda el hash, que siempre
 * mide lo mismo).
 *
 * 72 no es arbitrario: `bcryptjs` trunca en 72 bytes **en silencio**. Sin este
 * límite, una contraseña de 80 caracteres funciona con los primeros 72 y el
 * usuario nunca se entera de que los últimos 8 no cuentan.
 */
export const MAX_PASSWORD = 72;

/** Largo de `Credentials.mail` en el esquema. */
export const MAX_EMAIL = 100;
