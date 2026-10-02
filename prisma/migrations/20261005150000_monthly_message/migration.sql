-- CreateTable
CREATE TABLE "MonthlyMessage" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "editedById" TEXT,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonthlyMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MonthlyMessage_cycleId_key" ON "MonthlyMessage"("cycleId");
CREATE INDEX "MonthlyMessage_memberId_sentAt_idx" ON "MonthlyMessage"("memberId", "sentAt");
