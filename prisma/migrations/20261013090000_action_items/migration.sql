-- Ανάληψη επόμενων ενεργειών (13/10): μόνο προσθήκες, καμία αλλαγή σε υπάρχουσες εγγραφές.
ALTER TABLE "CareTask" ADD COLUMN "claimedById" TEXT;
ALTER TABLE "CareTask" ADD COLUMN "claimedByName" TEXT;
ALTER TABLE "CareTask" ADD COLUMN "claimedAt" TIMESTAMP(3);

CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "claimedById" TEXT,
    "claimedByName" TEXT,
    "claimedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "doneByName" TEXT,
    "doneNote" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionItem_memberId_ref_key" ON "ActionItem"("memberId", "ref");
CREATE INDEX "ActionItem_doneAt_createdAt_idx" ON "ActionItem"("doneAt", "createdAt");
