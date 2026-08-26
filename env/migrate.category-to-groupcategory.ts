import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, 'development.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) as any });

// Maps Category enum value → GroupCategory slug
const CATEGORY_MAP: Record<string, string> = {
  ARTES: 'artes',
  TEATRO: 'teatro',
  DANZAS: 'danzas',
  MUSICA: 'musica',
  CANTO: 'canto',
};

async function main() {
  console.log('🔄 Running category data migration...');

  // 1. Load GroupCategory slug → uid map
  const categories = await prisma.groupCategory.findMany({
    select: { uid: true, slug: true },
  });
  const categoryUidBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.uid]));

  if (categories.length === 0) {
    throw new Error('No GroupCategory rows found — run prisma:seed:static first');
  }

  // 2. Load quyca-platform uid
  const quycaPlatform = await prisma.institution.findUnique({
    where: { slug: 'quyca-platform' },
    select: { uid: true },
  });
  if (!quycaPlatform) throw new Error('quyca-platform institution not found — run prisma:seed:static first');

  // 3. Migrate Groups
  const groups = await prisma.$queryRaw<{ uid: string; category: string }[]>`
    SELECT uid::text, category FROM "Groups"
  `;

  let groupsUpdated = 0;
  for (const group of groups) {
    const slug = CATEGORY_MAP[group.category];
    if (!slug) {
      console.warn(`  ⚠️  Unknown category "${group.category}" on group ${group.uid}`);
      continue;
    }
    const categoryId = categoryUidBySlug[slug];
    await prisma.groups.update({
      where: { uid: group.uid },
      data: {
        categoryId,
        institutionId: quycaPlatform.uid,
      },
    });
    groupsUpdated++;
  }
  console.log(`  ✅ Groups migrated: ${groupsUpdated}`);

  // 4. Migrate Styles
  const styles = await prisma.$queryRaw<{ uid: string; category: string }[]>`
    SELECT uid::text, category FROM "Styles"
  `;

  let stylesUpdated = 0;
  for (const style of styles) {
    const slug = CATEGORY_MAP[style.category];
    if (!slug) {
      console.warn(`  ⚠️  Unknown category "${style.category}" on style ${style.uid}`);
      continue;
    }
    const categoryId = categoryUidBySlug[slug];
    await prisma.styles.update({
      where: { uid: style.uid },
      data: { categoryId },
    });
    stylesUpdated++;
  }
  console.log(`  ✅ Styles migrated: ${stylesUpdated}`);

  console.log('\n🎉 Data migration complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
