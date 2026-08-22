-- DropForeignKey
ALTER TABLE "InstitutionCategory" DROP CONSTRAINT "InstitutionCategory_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "InstitutionCategory" DROP CONSTRAINT "InstitutionCategory_institutionId_fkey";

-- DropTable
DROP TABLE "InstitutionCategory";
