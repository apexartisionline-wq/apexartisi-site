-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Assessment_memberId_createdAt_idx" ON "Assessment"("memberId", "createdAt");

-- CreateTable
CREATE TABLE "MemberProfile" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemberProfile_memberId_createdAt_idx" ON "MemberProfile"("memberId", "createdAt");

-- CreateTable
CREATE TABLE "TeamAlert" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    CONSTRAINT "TeamAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeamAlert_claimedAt_idx" ON "TeamAlert"("claimedAt");
CREATE INDEX "TeamAlert_memberId_source_kind_idx" ON "TeamAlert"("memberId", "source", "kind");
