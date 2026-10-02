-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "happenedAt" TIMESTAMP(3) NOT NULL,
    "data" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Incident_memberId_createdAt_idx" ON "Incident"("memberId", "createdAt");
CREATE INDEX "Incident_closedAt_idx" ON "Incident"("closedAt");

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "how" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Closure_memberId_createdAt_idx" ON "Closure"("memberId", "createdAt");
