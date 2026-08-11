-- CreateTable
CREATE TABLE "InstitutionCategory" (
    "uid" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionCategory_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE INDEX "InstitutionCategory_institutionId_idx" ON "InstitutionCategory"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionCategory_institutionId_categoryId_key" ON "InstitutionCategory"("institutionId", "categoryId");

-- AddForeignKey
ALTER TABLE "InstitutionCategory" ADD CONSTRAINT "InstitutionCategory_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionCategory" ADD CONSTRAINT "InstitutionCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
