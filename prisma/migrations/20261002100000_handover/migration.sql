-- AlterTable
ALTER TABLE "SessionNote" ADD COLUMN "riskChange" TEXT,
ADD COLUMN "usedSince" TEXT,
ADD COLUMN "nextStep" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "CaseSummary" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseSummary_memberId_createdAt_idx" ON "CaseSummary"("memberId", "createdAt");
