-- CreateEnum
CREATE TYPE "LibraryKind" AS ENUM ('PDF', 'AUDIO', 'VIDEO', 'LINK');

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "kind" "LibraryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mime" TEXT,
    "data" BYTEA,
    "size" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentPhoto" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryItem_published_createdAt_idx" ON "LibraryItem"("published", "createdAt");

-- CreateIndex
CREATE INDEX "Assignment_memberId_createdAt_idx" ON "Assignment"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssignmentPhoto" ADD CONSTRAINT "AssignmentPhoto_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

