-- AlterTable
ALTER TABLE "Groups" ADD COLUMN     "coverPhotoId" UUID,
ADD COLUMN     "description" VARCHAR(500),
ADD COLUMN     "rules" TEXT;

-- AddForeignKey
ALTER TABLE "Groups" ADD CONSTRAINT "Groups_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "Photos"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
