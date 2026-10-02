-- CreateTable
CREATE TABLE "CycleReview" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "goals" TEXT NOT NULL,
    "memberSays" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CycleReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CycleReview_memberId_createdAt_idx" ON "CycleReview"("memberId", "createdAt");
CREATE INDEX "CycleReview_cycleId_idx" ON "CycleReview"("cycleId");
