-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('EXHIBITION', 'WORKSHOP', 'PERFORMANCE', 'CONFERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "EventPhotoType" AS ENUM ('HERO', 'PROMO', 'MEMORY');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('EDUCATIONAL', 'INDEPENDENT');

-- CreateEnum
CREATE TYPE "InstitutionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContentRequestType" AS ENUM ('CATEGORY', 'STYLE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "UserTypes" (
    "uid" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTypes_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Roles" (
    "uid" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roles_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Users" (
    "uid" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "lastName" VARCHAR(30) NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "description" VARCHAR(500),
    "gender" VARCHAR(3) NOT NULL,
    "telNumber" VARCHAR(12) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userTypeId" UUID NOT NULL,
    "photoId" UUID,
    "roleId" UUID,
    "roleData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishAt" TIMESTAMP(3),

    CONSTRAINT "Users_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Credentials" (
    "uid" UUID NOT NULL,
    "mail" VARCHAR(100) NOT NULL,
    "password" VARCHAR(250) NOT NULL,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Credentials_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "VerificationCodes" (
    "uid" UUID NOT NULL,
    "credentialUid" UUID NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCodes_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Groups" (
    "uid" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "institutionId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "profesorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Groups_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "UsersGroups" (
    "uid" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsersGroups_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Products" (
    "uid" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'PENDING',
    "feedback" VARCHAR(300),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(10,2),
    "isSold" BOOLEAN NOT NULL DEFAULT false,
    "madeAt" TIMESTAMP(3) NOT NULL,
    "groupId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Products_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Styles" (
    "uid" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Styles_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "ProductStyle" (
    "uid" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "styleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStyle_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Photos" (
    "uid" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Photos_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "ProductPhoto" (
    "uid" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "photoId" UUID NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPhoto_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Events" (
    "uid" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "feedback" VARCHAR(500),
    "eventType" "EventType" NOT NULL DEFAULT 'EXHIBITION',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "locationUrl" VARCHAR(500),
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "streamingUrl" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Events_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "EventProduct" (
    "uid" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventProduct_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "EventInvitation" (
    "uid" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInvitation_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "EventPhoto" (
    "uid" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "photoId" UUID NOT NULL,
    "photoType" "EventPhotoType" NOT NULL DEFAULT 'PROMO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPhoto_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "UserProduct" (
    "uid" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "isAuthor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProduct_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "GroupEvent" (
    "uid" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupEvent_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "uid" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "institutionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Classes" (
    "uid" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "scheduleId" UUID,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "topic" VARCHAR(500),
    "review" VARCHAR(1000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "institutionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classes_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "uid" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "institutionId" UUID NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "uid" UUID NOT NULL,
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
    "uid" UUID NOT NULL,
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
    "uid" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "contextRole" VARCHAR(30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "UserInstitution_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "GroupCategory" (
    "uid" UUID NOT NULL,
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
    "uid" UUID NOT NULL,
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
    "uid" UUID NOT NULL,
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
CREATE UNIQUE INDEX "Roles_name_key" ON "Roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Roles_slug_key" ON "Roles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Users_uid_key" ON "Users"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Users_photoId_key" ON "Users"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "Credentials_mail_key" ON "Credentials"("mail");

-- CreateIndex
CREATE INDEX "VerificationCodes_credentialUid_idx" ON "VerificationCodes"("credentialUid");

-- CreateIndex
CREATE INDEX "Groups_institutionId_idx" ON "Groups"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "UsersGroups_userId_groupId_key" ON "UsersGroups"("userId", "groupId");

-- CreateIndex
CREATE INDEX "Products_institutionId_idx" ON "Products"("institutionId");

-- CreateIndex
CREATE INDEX "Products_institutionId_status_idx" ON "Products"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Styles_institutionId_idx" ON "Styles"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStyle_productId_styleId_key" ON "ProductStyle"("productId", "styleId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPhoto_productId_photoId_key" ON "ProductPhoto"("productId", "photoId");

-- CreateIndex
CREATE INDEX "Events_institutionId_idx" ON "Events"("institutionId");

-- CreateIndex
CREATE INDEX "Events_institutionId_startDate_idx" ON "Events"("institutionId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "EventProduct_productId_eventId_key" ON "EventProduct"("productId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventInvitation_eventId_groupId_key" ON "EventInvitation"("eventId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPhoto_eventId_photoId_key" ON "EventPhoto"("eventId", "photoId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProduct_userId_productId_key" ON "UserProduct"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupEvent_groupId_eventId_key" ON "GroupEvent"("groupId", "eventId");

-- CreateIndex
CREATE INDEX "Schedule_institutionId_idx" ON "Schedule"("institutionId");

-- CreateIndex
CREATE INDEX "Classes_institutionId_idx" ON "Classes"("institutionId");

-- CreateIndex
CREATE INDEX "Classes_institutionId_date_idx" ON "Classes"("institutionId", "date");

-- CreateIndex
CREATE INDEX "Attendance_institutionId_idx" ON "Attendance"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_classId_userId_key" ON "Attendance"("classId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_slug_key" ON "Institution"("slug");

-- CreateIndex
CREATE INDEX "UserInstitution_institutionId_isActive_idx" ON "UserInstitution"("institutionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserInstitution_userId_institutionId_key" ON "UserInstitution"("userId", "institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupCategory_name_key" ON "GroupCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupCategory_slug_key" ON "GroupCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionInvitation_token_key" ON "InstitutionInvitation"("token");

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_userTypeId_fkey" FOREIGN KEY ("userTypeId") REFERENCES "UserTypes"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photos"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Roles"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Groups" ADD CONSTRAINT "Groups_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Groups" ADD CONSTRAINT "Groups_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Groups" ADD CONSTRAINT "Groups_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Users"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsersGroups" ADD CONSTRAINT "UsersGroups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsersGroups" ADD CONSTRAINT "UsersGroups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Groups"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Groups"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Styles" ADD CONSTRAINT "Styles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Styles" ADD CONSTRAINT "Styles_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Groups"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Styles" ADD CONSTRAINT "Styles_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStyle" ADD CONSTRAINT "ProductStyle_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStyle" ADD CONSTRAINT "ProductStyle_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Styles"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPhoto" ADD CONSTRAINT "ProductPhoto_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPhoto" ADD CONSTRAINT "ProductPhoto_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photos"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Events" ADD CONSTRAINT "Events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Events" ADD CONSTRAINT "Events_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventProduct" ADD CONSTRAINT "EventProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventProduct" ADD CONSTRAINT "EventProduct_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvitation" ADD CONSTRAINT "EventInvitation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvitation" ADD CONSTRAINT "EventInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Groups"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPhoto" ADD CONSTRAINT "EventPhoto_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPhoto" ADD CONSTRAINT "EventPhoto_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photos"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProduct" ADD CONSTRAINT "UserProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProduct" ADD CONSTRAINT "UserProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEvent" ADD CONSTRAINT "GroupEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Groups"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEvent" ADD CONSTRAINT "GroupEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Groups"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classes" ADD CONSTRAINT "Classes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Groups"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classes" ADD CONSTRAINT "Classes_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classes" ADD CONSTRAINT "Classes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classes"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

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
