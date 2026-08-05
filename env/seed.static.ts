import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, 'development.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) as any });

async function main() {
  console.log('🌱 Seeding static data...');

  // 1. UserTypes — upsert by name (existing rows may already exist)
  const userTypes = [
    { name: 'super_admin' },
    { name: 'institution' },
    { name: 'professor' },
    { name: 'user' },
  ];

  for (const ut of userTypes) {
    const existing = await prisma.userTypes.findFirst({ where: { name: ut.name } });
    if (!existing) {
      const created = await prisma.userTypes.create({ data: ut, select: { uid: true, name: true } });
      console.log(`  ✅ UserType "${ut.name}" created — uid: ${created.uid}`);
      console.log(`     → Add to development.env: ID_${ut.name.toUpperCase()}=${created.uid}`);
    } else {
      console.log(`  ⏭  UserType "${ut.name}" already exists — uid: ${existing.uid}`);
    }
  }

  // 2. SubscriptionPlans
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

  // 3. GroupCategories
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

  // 4. Institution: quyca-platform
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

  console.log('\n🎉 Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
