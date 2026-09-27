-- AlterTable
ALTER TABLE "HelpRequest" ADD COLUMN     "deliveryFailedAt" TIMESTAMP(3),
ADD COLUMN     "isDrill" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "talkedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "HelpOpen" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpOpen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnCall" (
    "date" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "OnCall_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "CareTask" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyPlan" (
    "memberId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SafetyPlan_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT,
    "action" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HelpOpen_memberId_openedAt_idx" ON "HelpOpen"("memberId", "openedAt");

-- CreateIndex
CREATE INDEX "CareTask_doneAt_dueAt_idx" ON "CareTask"("doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "AccessLog_memberId_at_idx" ON "AccessLog"("memberId", "at");

-- CreateIndex
CREATE INDEX "AccessLog_userId_at_idx" ON "AccessLog"("userId", "at");

