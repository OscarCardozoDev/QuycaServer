import { PrismaClient } from '../src/generated/prisma/client';
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
  const plans = [
    {
      name: 'Empírico',
      slug: 'empirico',
      features: ['profile', 'public_gallery', 'portfolio', 'events_view'],
      maxUsers: null,
      maxGroups: null,
      priceUsd: null,
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
      priceUsd: null,
    },
    {
      name: 'Independiente',
      slug: 'independiente',
      features: [
        'profile', 'public_gallery', 'portfolio',
        'groups_join', 'groups_create', 'products_submit',
        'events_view', 'events_create', 'classes_attend',
        'schedule_view', 'certificates_receive', 'analytics', 'content_requests',
      ],
      maxUsers: 50,
      maxGroups: 5,
      priceUsd: null,
    },
  ];

  let empiricoUid = '';
  for (const plan of plans) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { slug: plan.slug } });
    if (!existing) {
      const created = await prisma.subscriptionPlan.create({ data: plan, select: { uid: true } });
      if (plan.slug === 'empirico') empiricoUid = created.uid;
      console.log(`  ✅ Plan "${plan.slug}" created`);
    } else {
      if (plan.slug === 'empirico') empiricoUid = existing.uid;
      console.log(`  ⏭  Plan "${plan.slug}" already exists`);
    }
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
