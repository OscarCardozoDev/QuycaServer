import { PrismaClient } from '../src/generated/prisma/client';
import { FEATURE_LABELS } from '../src/modules/institutions/plan-features';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, 'development.env') });

export const USER_TYPE_IDS = {
  super_admin: '00000000-0000-4000-8000-000000000001',
  institution: '00000000-0000-4000-8000-000000000002',
  professor:   '00000000-0000-4000-8000-000000000003',
  user:        '00000000-0000-4000-8000-000000000004',
} as const;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) as any });

async function main() {
  console.log('🌱 Seeding static data...');

  // 1. UserTypes
  for (const [name, uid] of Object.entries(USER_TYPE_IDS)) {
    await prisma.userTypes.upsert({
      where: { uid },
      update: { name },
      create: { uid, name },
    });
    console.log(`  ✅ UserType "${name}" — uid: ${uid}`);
  }

  // 2. Roles
  const roles = [
    { name: 'Estudiante',              slug: 'student' },
    { name: 'Autodidacta',             slug: 'self-taught' },
    { name: 'Docente institucional',   slug: 'institutional' },
    { name: 'Docente independiente',   slug: 'independent' },
    { name: 'Rector',                  slug: 'rector' },
    { name: 'Coordinador',             slug: 'coordinator' },
  ];

  for (const role of roles) {
    await prisma.roles.upsert({
      where: { slug: role.slug },
      update: { name: role.name },
      create: role,
    });
    console.log(`  ✅ Role "${role.slug}"`);
  }

  // 3. SubscriptionPlans
  //
  // Los tres planes tienen que diferenciarse de verdad. La guía es el límite
  // de usuarios/grupos que ya estaba en la base:
  //   - empirico     → artista suelto. Gratis, solo vitrina: ni crea ni gestiona.
  //   - independiente→ docente por su cuenta. 50 usuarios / 5 grupos, da clases
  //                    y arma eventos, PERO sin las funciones de gestión
  //                    institucional (certificados, estadísticas, solicitudes).
  //   - academia     → institución. Sin límites y con todo lo de gestión.
  //
  // ⚠️ Los strings de `features` son slugs de autorización, no texto de UI:
  // FeatureGuard los compara contra @RequireFeature(). Las etiquetas legibles
  // viven en src/modules/institutions/plan-features.ts y el chequeo de abajo
  // falla si acá se siembra un slug que ese catálogo no conoce.
  const plans = [
    {
      name: 'Empírico',
      slug: 'empirico',
      features: ['profile', 'public_gallery', 'portfolio', 'events_view'],
      maxUsers: null,
      maxGroups: null,
      priceUsd: 0,
    },
    {
      name: 'Independiente',
      slug: 'independiente',
      features: [
        'profile', 'public_gallery', 'portfolio',
        'groups_join', 'groups_create', 'products_submit',
        'events_view', 'events_create', 'classes_attend', 'schedule_view',
      ],
      maxUsers: 50,
      maxGroups: 5,
      priceUsd: 19,
    },
    {
      name: 'Academia',
      slug: 'academia',
      features: [
        'profile', 'public_gallery', 'portfolio',
        'groups_join', 'groups_create', 'products_submit',
        'events_view', 'events_create', 'classes_attend',
        'schedule_view', 'certificates_receive', 'analytics', 'content_requests',
      ],
      maxUsers: null,
      maxGroups: null,
      priceUsd: 49,
    },
  ];

  const unknownFeatures = plans
    .flatMap((plan) => plan.features)
    .filter((slug) => !(slug in FEATURE_LABELS));
  if (unknownFeatures.length) {
    throw new Error(
      `Features sin etiqueta en plan-features.ts: ${[...new Set(unknownFeatures)].join(', ')}`,
    );
  }

  // upsert, no "crear si no existe": el seed corre muchas veces sobre la misma
  // base y antes cambiar las features de un plan ya sembrado no tenía ningún
  // efecto. Se actualizan solo los campos de contenido — isActive y
  // stripePriceId quedan fuera del `update` para no pisar lo que se haya
  // configurado a mano (dar de baja un plan, atar un precio de Stripe).
  let empiricoUid = '';
  for (const plan of plans) {
    const saved = await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        features: plan.features,
        maxUsers: plan.maxUsers,
        maxGroups: plan.maxGroups,
        priceUsd: plan.priceUsd,
      },
      create: plan,
      select: { uid: true },
    });
    if (plan.slug === 'empirico') empiricoUid = saved.uid;
    console.log(`  ✅ Plan "${plan.slug}" upserted`);
  }

  // 4. GroupCategories
  const categories = [
    { name: 'Artes Plásticas', slug: 'artes', iconSlug: 'palette' },
    { name: 'Teatro', slug: 'teatro', iconSlug: 'theater' },
    { name: 'Danzas', slug: 'danzas', iconSlug: 'dance' },
    { name: 'Música', slug: 'musica', iconSlug: 'music-note' },
    { name: 'Canto', slug: 'canto', iconSlug: 'microphone' },
  ];

  for (const cat of categories) {
    const existing = await prisma.groupCategory.findUnique({ where: { slug: cat.slug } });
    if (!existing) {
      await prisma.groupCategory.create({ data: cat });
      console.log(`  ✅ GroupCategory "${cat.slug}" created`);
    } else {
      console.log(`  ⏭  GroupCategory "${cat.slug}" already exists`);
    }
  }

  // 5. Institution: quyca-platform
  if (!empiricoUid) {
    throw new Error('Empírico plan uid not found — run plans seed first');
  }

  const existing = await prisma.institution.findUnique({ where: { slug: 'quyca-platform' } });
  if (!existing) {
    await prisma.institution.create({
      data: {
        name: 'Quyca Platform',
        slug: 'quyca-platform',
        type: 'EDUCATIONAL',
        status: 'ACTIVE',
        subscriptionPlanId: empiricoUid,
        // quyca-platform no es una institución cliente: su plan lo fija el
        // seed, no lo elige nadie. Sin este sello, `resolveOnboardingSteps`
        // ve `planChosenAt == null` y traba a cualquier rector suyo en el paso
        // 'choose-plan'.
        planChosenAt: new Date(),
      },
    });
    console.log('  ✅ Institution "quyca-platform" created');
  } else if (existing.planChosenAt == null) {
    // Bases sembradas antes de que existiera el sello: se marca una sola vez.
    await prisma.institution.update({
      where: { uid: existing.uid },
      data: { planChosenAt: new Date() },
    });
    console.log('  ✅ Institution "quyca-platform" — planChosenAt sellado');
  } else {
    console.log('  ⏭  Institution "quyca-platform" already exists');
  }

  // 6. Grupos de plataforma: uno por GroupCategory, dentro de quyca-platform.
  // Son buckets de publicación para artistas independientes: sin profesor,
  // sin horarios y sin clases. Ver el spec de onboarding multi-institución.
  const platform = await prisma.institution.findUnique({
    where: { slug: 'quyca-platform' },
    select: { uid: true },
  });
  if (!platform) {
    throw new Error('Institution "quyca-platform" not found — no se puede sembrar sus grupos');
  }

  const allCategories = await prisma.groupCategory.findMany({
    select: { uid: true, name: true },
  });

  for (const cat of allCategories) {
    const existing = await prisma.groups.findFirst({
      where: { institutionId: platform.uid, name: cat.name },
      select: { uid: true },
    });
    if (!existing) {
      await prisma.groups.create({
        data: {
          name: cat.name,
          institutionId: platform.uid,
          categoryId: cat.uid,
          profesorId: null,
        },
      });
      console.log(`  ✅ Grupo de plataforma "${cat.name}" created`);
    } else {
      console.log(`  ⏭  Grupo de plataforma "${cat.name}" already exists`);
    }
  }

  // 7. Usuario admin de desarrollo
  //
  // `Credentials` y `Users` son tablas separadas que comparten el MISMO uid: el
  // de `Credentials` manda, y la fila de `Users` se crea con ese uid a mano. No
  // hay FK entre las dos, la identidad es la clave primaria.
  //
  // El hash es bcrypt de una contraseña de prueba, puesto literal a propósito:
  // sembrar no debería depender de bcrypt en tiempo de seed, y así el seed es
  // determinista. ⚠️ Es una credencial de desarrollo — no sembrar esto en
  // producción.
  const ADMIN_MAIL = 'admin@gmail.com';
  const ADMIN_PASSWORD_HASH =
    '$2a$12$ez0MVVzCF8lbiQm/n6OQTOyAKrQs2uiqlOgbPinfR9xBwKymr85Ta';

  const adminCredential = await prisma.credentials.upsert({
    where: { mail: ADMIN_MAIL },
    // `isEmailVerified: true` no es cosmético: el login resuelve los pasos de
    // onboarding con ese flag, y sin él la cuenta queda trabada pidiendo el
    // código de verificación que en desarrollo no llega.
    update: { password: ADMIN_PASSWORD_HASH, isEmailVerified: true },
    create: {
      mail: ADMIN_MAIL,
      password: ADMIN_PASSWORD_HASH,
      isEmailVerified: true,
    },
    select: { uid: true },
  });

  await prisma.users.upsert({
    where: { uid: adminCredential.uid },
    update: { userTypeId: USER_TYPE_IDS.super_admin, isActive: true },
    create: {
      uid: adminCredential.uid,
      name: 'Admin',
      lastName: 'Quyca',
      username: 'admin',
      gender: 'M',
      telNumber: '3000000000',
      userTypeId: USER_TYPE_IDS.super_admin,
    },
  });
  console.log(`  ✅ Usuario admin "${ADMIN_MAIL}" — uid: ${adminCredential.uid}`);

  // Membresía en quyca-platform.
  //
  // `UserTypes.super_admin` es identidad global y alcanza para los endpoints
  // marcados con @AllowCrossTenant(), pero NO para el resto: `TenantGuard`
  // resuelve el slug del header y exige membresía activa, así que sin esta fila
  // el admin recibe 403 en todo el dashboard. `contextRole` es lo que autoriza
  // (nunca el userType), y va en minúscula: es el slug de `Roles`.
  await prisma.userInstitution.upsert({
    where: {
      userId_institutionId: {
        userId: adminCredential.uid,
        institutionId: platform.uid,
      },
    },
    update: { contextRole: 'rector', isActive: true },
    create: {
      userId: adminCredential.uid,
      institutionId: platform.uid,
      contextRole: 'rector',
      isActive: true,
    },
  });
  console.log('  ✅ Admin con membresía "rector" en quyca-platform');

  console.log('\n🎉 Seed complete.');
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
