-- CreateTable
CREATE TABLE "RecordHistory" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "memberId" TEXT,
    "ref" TEXT,
    "before" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordHistory_kind_ref_idx" ON "RecordHistory"("kind", "ref");

-- CreateIndex
CREATE INDEX "RecordHistory_memberId_idx" ON "RecordHistory"("memberId");
