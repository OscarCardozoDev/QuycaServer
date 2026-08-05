-- Drop old category column from Groups
ALTER TABLE "Groups" DROP COLUMN "category";

-- Make institutionId non-nullable on Groups
ALTER TABLE "Groups" ALTER COLUMN "institutionId" SET NOT NULL;

-- Make categoryId non-nullable on Groups
ALTER TABLE "Groups" ALTER COLUMN "categoryId" SET NOT NULL;

-- Drop old category column from Styles
ALTER TABLE "Styles" DROP COLUMN "category";

-- Make categoryId non-nullable on Styles
ALTER TABLE "Styles" ALTER COLUMN "categoryId" SET NOT NULL;

-- Drop the Category enum type
DROP TYPE "Category";
