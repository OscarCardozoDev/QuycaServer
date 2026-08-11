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
      },
    });
    console.log('  ✅ Institution "quyca-platform" created');
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

  // quyca-platform oferta las 5: sus grupos son los buckets donde publica
  // cualquier artista independiente, sin importar la disciplina. Sin estas
  // filas, GroupService.createGroupUseCase rechazaría cualquier grupo nuevo
  // acá — las filas son la oferta, "vacío" no significa "todas".
  const offered = await prisma.institutionCategory.createMany({
    data: allCategories.map((cat) => ({
      institutionId: platform.uid,
      categoryId: cat.uid,
    })),
    skipDuplicates: true,
  });
  console.log(`  ✅ quyca-platform oferta ${allCategories.length} categorías (${offered.count} nuevas)`);

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

  console.log('\n🎉 Seed complete.');
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
