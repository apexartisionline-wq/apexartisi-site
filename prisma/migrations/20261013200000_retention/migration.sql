-- Χρόνοι τήρησης (έγγραφο 13): αναστολή διαγραφής και πρωτόκολλο εκκαθάρισης. Μόνο προσθήκες.
CREATE TABLE "RetentionHold" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    CONSTRAINT "RetentionHold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RetentionHold_memberId_liftedAt_idx" ON "RetentionHold"("memberId", "liftedAt");

CREATE TABLE "PurgeLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "byId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurgeLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurgeLog_at_idx" ON "PurgeLog"("at");
CREATE INDEX "PurgeLog_runId_idx" ON "PurgeLog"("runId");
