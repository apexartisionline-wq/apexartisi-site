-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "goalCheck" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "goalNote" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "WeeklyGoal" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WeeklyGoal_memberId_week_createdAt_idx" ON "WeeklyGoal"("memberId", "week", "createdAt");
