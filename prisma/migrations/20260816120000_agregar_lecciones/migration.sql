-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LessonGlobalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Lessons" (
    "uid" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "coverPhotoId" UUID,
    "institutionId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "groupId" UUID,
    "authorId" UUID NOT NULL,
    "institutionStatus" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "institutionFeedback" TEXT,
    "institutionReviewedBy" UUID,
    "institutionReviewedAt" TIMESTAMP(3),
    "globalStatus" "LessonGlobalStatus",
    "globalFeedback" TEXT,
    "globalReviewedBy" UUID,
    "globalReviewedAt" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lessons_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Chapters" (
    "uid" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "contentMd" TEXT NOT NULL,
    "videoUrl" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "institutionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapters_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "ChapterPhoto" (
    "uid" UUID NOT NULL,
    "chapterId" UUID NOT NULL,
    "photoId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterPhoto_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "uid" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "chapterId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE INDEX "Lessons_institutionId_idx" ON "Lessons"("institutionId");

-- CreateIndex
CREATE INDEX "Lessons_institutionId_institutionStatus_idx" ON "Lessons"("institutionId", "institutionStatus");

-- CreateIndex
CREATE INDEX "Lessons_globalStatus_idx" ON "Lessons"("globalStatus");

-- CreateIndex
CREATE INDEX "Lessons_isPublic_categoryId_idx" ON "Lessons"("isPublic", "categoryId");

-- CreateIndex
CREATE INDEX "Chapters_institutionId_idx" ON "Chapters"("institutionId");

-- CreateIndex
CREATE INDEX "Chapters_lessonId_sequence_idx" ON "Chapters"("lessonId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterPhoto_chapterId_photoId_key" ON "ChapterPhoto"("chapterId", "photoId");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_lessonId_idx" ON "LessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_chapterId_key" ON "LessonProgress"("userId", "chapterId");

-- AddForeignKey
ALTER TABLE "Lessons" ADD CONSTRAINT "Lessons_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "Photos"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lessons" ADD CONSTRAINT "Lessons_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lessons" ADD CONSTRAINT "Lessons_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lessons" ADD CONSTRAINT "Lessons_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Groups"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lessons" ADD CONSTRAINT "Lessons_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapters" ADD CONSTRAINT "Chapters_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lessons"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapters" ADD CONSTRAINT "Chapters_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPhoto" ADD CONSTRAINT "ChapterPhoto_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapters"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPhoto" ADD CONSTRAINT "ChapterPhoto_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photos"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapters"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lessons"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
