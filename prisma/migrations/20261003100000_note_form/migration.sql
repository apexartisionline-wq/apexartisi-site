-- AlterTable
ALTER TABLE "SessionNote" ADD COLUMN "data" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SessionNoteVersion" ADD COLUMN "data" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "soberSince" TEXT;

-- CreateTable
CREATE TABLE "SobrietyChange" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "previous" TEXT,
    "date" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "byId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SobrietyChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SobrietyChange_memberId_at_idx" ON "SobrietyChange"("memberId", "at");
