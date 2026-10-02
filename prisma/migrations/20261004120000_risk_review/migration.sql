-- CreateTable
CREATE TABLE "RiskReview" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiskReview_memberId_createdAt_idx" ON "RiskReview"("memberId", "createdAt");
