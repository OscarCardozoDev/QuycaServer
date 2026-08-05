-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('EDUCATIONAL', 'INDEPENDENT');

-- CreateEnum
CREATE TYPE "InstitutionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContentRequestType" AS ENUM ('CATEGORY', 'STYLE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "uid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(30) NOT NULL,
    "features" JSONB NOT NULL,
    "maxUsers" INTEGER,
    "maxGroups" INTEGER,
    "priceUsd" DECIMAL(10,2),
    "stripePriceId" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Institution" (
    "uid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "type" "InstitutionType" NOT NULL DEFAULT 'EDUCATIONAL',
    "status" "InstitutionStatus" NOT NULL DEFAULT 'TRIAL',
    "subscriptionPlanId" UUID NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "UserInstitution" (
    "uid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "contextRole" VARCHAR(30) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInstitution_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "GroupCategory" (
    "uid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(30) NOT NULL,
    "iconSlug" VARCHAR(50) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupCategory_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "InstitutionInvitation" (
    "uid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "toEmail" VARCHAR(100) NOT NULL,
    "toUserId" UUID,
    "targetRole" VARCHAR(30) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionInvitation_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "ContentRequest" (
    "uid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "type" "ContentRequestType" NOT NULL,
    "requestedName" VARCHAR(100) NOT NULL,
    "categoryId" UUID,
    "justification" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentRequest_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_slug_key" ON "Institution"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UserInstitution_userId_institutionId_key" ON "UserInstitution"("userId", "institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupCategory_name_key" ON "GroupCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupCategory_slug_key" ON "GroupCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionInvitation_token_key" ON "InstitutionInvitation"("token");

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInstitution" ADD CONSTRAINT "UserInstitution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInstitution" ADD CONSTRAINT "UserInstitution_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionInvitation" ADD CONSTRAINT "InstitutionInvitation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionInvitation" ADD CONSTRAINT "InstitutionInvitation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "Users"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Groups
ALTER TABLE "Groups" ADD COLUMN "institutionId" UUID,
ADD COLUMN "categoryId" UUID;

ALTER TABLE "Groups" ADD CONSTRAINT "Groups_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Groups" ADD CONSTRAINT "Groups_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- Make profesorId nullable
ALTER TABLE "Groups" ALTER COLUMN "profesorId" DROP NOT NULL;

-- AlterTable Styles
ALTER TABLE "Styles" ADD COLUMN "categoryId" UUID;

ALTER TABLE "Styles" ADD CONSTRAINT "Styles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
