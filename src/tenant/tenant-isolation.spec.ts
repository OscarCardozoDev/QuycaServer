import { PrismaClient } from 'src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { tenantStorage } from './tenant-context';
import { applyTenantScope } from './tenant.extension';

// Test de integración: ejercita la extensión real (`applyTenantScope`) contra
// una base de datos Postgres real, con dos instituciones reales. No usa
// mocks — es el criterio de aceptación de todo el plan de aislamiento.
config({ path: 'env/development.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const raw = new PrismaClient({ adapter: new PrismaPg(pool) });
const prisma = applyTenantScope(raw);

const SUFFIX = Date.now().toString(36);

let instA: string;
let instB: string;
let categoryId: string;
let planId: string;
let userTypeId: string;

interface Fixtures {
  userId: string;
  groupId: string;
  productId: string;
  styleId: string;
  eventId: string;
  scheduleId: string;
  classId: string;
  attendanceId: string;
  contentRequestId: string;
}

let fxA: Fixtures;
let fxB: Fixtures;

/**
 * Ejecuta `fn` bajo el store de tenant dado.
 *
 * `tenantStorage.run(store, callback)` solo mantiene el store activo durante
 * la ejecución SÍNCRONA de `callback`. Los métodos de Prisma devuelven un
 * thenable lazy ("PrismaPromise") que no dispara la extensión hasta que
 * alguien llama `.then()` sobre él. Se comprobó empíricamente (ver
 * task-14-report.md) que si `fn` se limita a devolver ese thenable sin
 * tocarlo — `() => prisma.groups.findMany()` tal como lo escribe el brief —
 * el `.then()` real ocurre en el `await` de quien llama, que pasa DESPUÉS de
 * que `run()` ya devolvió y restauró el store externo: la extensión ve
 * `tenantStorage.getStore() === undefined` y no filtra nada.
 *
 * Se reproduce acá el mismo fix que ya usa `runWithoutTenant` en
 * tenant-context.ts: encadenar `.then()` sobre el resultado de `fn()`
 * TODAVÍA dentro del callback síncrono de `run()`, para que la extensión
 * dispare mientras el store sigue activo. Una cadena async/await real (como
 * la del flujo de request de NestJS: middleware → guard → controller →
 * service) no tiene este problema — se verificó por separado que sí
 * propaga el contexto correctamente sin este wrapper.
 */
function runInStore<T>(
  store: { institutionId: string | null; bypass: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  return tenantStorage.run(store, () => {
    const result = fn();
    return new Promise<T>((resolve, reject) => result.then(resolve, reject));
  });
}

function asTenant<T>(institutionId: string, fn: () => Promise<T>): Promise<T> {
  return runInStore({ institutionId, bypass: false }, fn);
}

/**
 * Crea una fila para cada uno de los 8 modelos scoped, todas apuntando a
 * `institutionId`. Se crean con `raw` (cliente sin extender) porque no hay
 * store de tenant activo durante el setup — usar `prisma` aquí sería
 * equivalente, pero `raw` deja explícito que estas filas son fixtures, no
 * parte de lo que se está probando.
 */
async function createFixtures(institutionId: string, label: string): Promise<Fixtures> {
  const user = await raw.users.create({
    data: {
      uid: randomUUID(),
      name: label,
      lastName: 'Tester',
      username: `iso-${label}-${SUFFIX}`,
      gender: 'NA',
      telNumber: '3000000000',
      userTypeId,
    },
    select: { uid: true },
  });

  const group = await raw.groups.create({
    data: { name: `Grupo ${label} ${SUFFIX}`, institutionId, categoryId },
    select: { uid: true },
  });

  const product = await raw.products.create({
    data: {
      name: `Producto ${label} ${SUFFIX}`,
      description: 'desc',
      madeAt: new Date(),
      groupId: group.uid,
      institutionId,
    },
    select: { uid: true },
  });

  const style = await raw.styles.create({
    data: {
      name: `Estilo ${label} ${SUFFIX}`,
      description: 'desc',
      categoryId,
      groupId: group.uid,
      institutionId,
    },
    select: { uid: true },
  });

  const event = await raw.events.create({
    data: {
      name: `Evento ${label} ${SUFFIX}`,
      description: 'desc',
      startDate: new Date(),
      createdById: user.uid,
      institutionId,
    },
    select: { uid: true },
  });

  const schedule = await raw.schedule.create({
    data: {
      groupId: group.uid,
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '10:00',
      institutionId,
    },
    select: { uid: true },
  });

  const classRow = await raw.classes.create({
    data: {
      groupId: group.uid,
      date: new Date(),
      startTime: '08:00',
      endTime: '10:00',
      institutionId,
    },
    select: { uid: true },
  });

  const attendance = await raw.attendance.create({
    data: { classId: classRow.uid, userId: user.uid, institutionId },
    select: { uid: true },
  });

  const contentRequest = await raw.contentRequest.create({
    data: { type: 'STYLE', requestedName: `Solicitud ${label} ${SUFFIX}`, institutionId },
    select: { uid: true },
  });

  return {
    userId: user.uid,
    groupId: group.uid,
    productId: product.uid,
    styleId: style.uid,
    eventId: event.uid,
    scheduleId: schedule.uid,
    classId: classRow.uid,
    attendanceId: attendance.uid,
    contentRequestId: contentRequest.uid,
  };
}

beforeAll(async () => {
  const plan = await raw.subscriptionPlan.findUniqueOrThrow({ where: { slug: 'academia' } });
  planId = plan.uid;

  const category = await raw.groupCategory.findFirstOrThrow();
  categoryId = category.uid;

  const type = await raw.userTypes.findFirstOrThrow();
  userTypeId = type.uid;

  const a = await raw.institution.create({
    data: {
      name: `A ${SUFFIX}`,
      slug: `iso-a-${SUFFIX}`,
      status: 'ACTIVE',
      subscriptionPlanId: planId,
    },
    select: { uid: true },
  });
  const b = await raw.institution.create({
    data: {
      name: `B ${SUFFIX}`,
      slug: `iso-b-${SUFFIX}`,
      status: 'ACTIVE',
      subscriptionPlanId: planId,
    },
    select: { uid: true },
  });
  instA = a.uid;
  instB = b.uid;

  fxA = await createFixtures(instA, 'A');
  fxB = await createFixtures(instB, 'B');
});

afterAll(async () => {
  const ids = [instA, instB].filter(Boolean);
  const userIds = [fxA?.userId, fxB?.userId].filter(Boolean) as string[];

  // Orden FK-safe: hijos antes que padres. Cada paso se intenta
  // independientemente — un fallo en un paso no debe saltarse el resto,
  // para dejar la base lo más limpia posible aunque algo falle a mitad.
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['attendance', () => raw.attendance.deleteMany({ where: { institutionId: { in: ids } } })],
    ['contentRequest', () => raw.contentRequest.deleteMany({ where: { institutionId: { in: ids } } })],
    ['classes', () => raw.classes.deleteMany({ where: { institutionId: { in: ids } } })],
    ['schedule', () => raw.schedule.deleteMany({ where: { institutionId: { in: ids } } })],
    ['events', () => raw.events.deleteMany({ where: { institutionId: { in: ids } } })],
    ['styles', () => raw.styles.deleteMany({ where: { institutionId: { in: ids } } })],
    ['products', () => raw.products.deleteMany({ where: { institutionId: { in: ids } } })],
    ['groups', () => raw.groups.deleteMany({ where: { institutionId: { in: ids } } })],
    ['users', () => raw.users.deleteMany({ where: { uid: { in: userIds } } })],
    ['institution', () => raw.institution.deleteMany({ where: { uid: { in: ids } } })],
  ];

  const errors: string[] = [];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await raw.$disconnect();
  await pool.end();

  if (errors.length > 0) {
    throw new Error(`afterAll cleanup had ${errors.length} failure(s):\n${errors.join('\n')}`);
  }
});

// Un caso por cada uno de los 8 modelos scoped, referenciando la fila propia
// (A) y la del otro tenant (B) creadas en el setup. `client` se castea porque
// cada modelo de Prisma tiene un tipo distinto, pero todos comparten la
// forma findMany/findUnique que necesitamos para las aserciones genéricas.
interface ScopedClient {
  findMany: (args?: unknown) => Promise<Array<{ uid: string; institutionId: string }>>;
  findUnique: (args: {
    where: { uid: string };
  }) => Promise<{ uid: string; institutionId: string } | null>;
}

function scopedCase(
  name: string,
  client: unknown,
  ownUid: () => string,
  otherUid: () => string,
) {
  return { name, client: client as ScopedClient, ownUid, otherUid };
}

const SCOPED_MODEL_CASES = [
  scopedCase('Groups', prisma.groups, () => fxA.groupId, () => fxB.groupId),
  scopedCase('Products', prisma.products, () => fxA.productId, () => fxB.productId),
  scopedCase('Styles', prisma.styles, () => fxA.styleId, () => fxB.styleId),
  scopedCase('Events', prisma.events, () => fxA.eventId, () => fxB.eventId),
  scopedCase('Schedule', prisma.schedule, () => fxA.scheduleId, () => fxB.scheduleId),
  scopedCase('Classes', prisma.classes, () => fxA.classId, () => fxB.classId),
  scopedCase('Attendance', prisma.attendance, () => fxA.attendanceId, () => fxB.attendanceId),
  scopedCase(
    'ContentRequest',
    prisma.contentRequest,
    () => fxA.contentRequestId,
    () => fxB.contentRequestId,
  ),
];

describe('aislamiento cruzado — los 8 modelos scoped', () => {
  it.each(SCOPED_MODEL_CASES)(
    '$name: findMany bajo el tenant A no devuelve filas de B',
    async ({ client, ownUid, otherUid }) => {
      const rows = await asTenant(instA, () => client.findMany());
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.institutionId === instA)).toBe(true);
      expect(rows.some((r) => r.uid === otherUid())).toBe(false);
      expect(rows.some((r) => r.uid === ownUid())).toBe(true);
    },
  );

  it.each(SCOPED_MODEL_CASES)(
    '$name: findUnique de la fila del otro tenant devuelve null',
    async ({ client, otherUid }) => {
      const found = await asTenant(instA, () => client.findUnique({ where: { uid: otherUid() } }));
      expect(found).toBeNull();
    },
  );

  it.each(SCOPED_MODEL_CASES)(
    '$name: findUnique de la propia fila SÍ la devuelve',
    async ({ client, ownUid }) => {
      const found = await asTenant(instA, () => client.findUnique({ where: { uid: ownUid() } }));
      expect(found).not.toBeNull();
      expect(found?.institutionId).toBe(instA);
    },
  );
});

describe('mecánica de scoping (Groups como representativo — la lógica es genérica por modelo)', () => {
  it('create inyecta el institutionId del tenant activo', async () => {
    const created = await asTenant(instA, () =>
      prisma.groups.create({
        data: { name: `Creado ${SUFFIX}`, categoryId } as any,
        select: { uid: true, institutionId: true },
      }),
    );
    expect(created.institutionId).toBe(instA);
  });

  it('create SOBRESCRIBE un institutionId ajeno provisto por el caller', async () => {
    const created = await asTenant(instA, () =>
      prisma.groups.create({
        data: { name: `Suplantado ${SUFFIX}`, categoryId, institutionId: instB } as any,
        select: { uid: true, institutionId: true },
      }),
    );
    expect(created.institutionId).toBe(instA);
    expect(created.institutionId).not.toBe(instB);
  });

  it('updateMany no alcanza filas del otro tenant', async () => {
    const result = await asTenant(instA, () =>
      prisma.groups.updateMany({ where: {}, data: { isActive: false } }),
    );
    const untouched = await raw.groups.findUniqueOrThrow({ where: { uid: fxB.groupId } });
    expect(untouched.isActive).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  it('falla cerrado sin institución en el store', async () => {
    await expect(
      runInStore({ institutionId: null, bypass: false }, () => prisma.groups.findMany()),
    ).rejects.toThrow('Tenant context required');
  });

  it('bypass permite ver todos los tenants', async () => {
    const groups = await runInStore({ institutionId: instA, bypass: true }, () =>
      prisma.groups.findMany({ where: { institutionId: { in: [instA, instB] } } }),
    );
    const institutions = new Set(groups.map((g) => g.institutionId));
    expect(institutions.size).toBe(2);
  });
});
