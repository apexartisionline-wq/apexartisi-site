-- CreateTable
CREATE TABLE "PairNote" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '',
    "riskChange" TEXT,
    "usedSince" TEXT,
    "nextStep" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PairNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PairNote_slotId_memberId_key" ON "PairNote"("slotId", "memberId");

-- CreateIndex
CREATE INDEX "PairNote_memberId_idx" ON "PairNote"("memberId");

-- AddForeignKey
ALTER TABLE "PairNote" ADD CONSTRAINT "PairNote_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairNote" ADD CONSTRAINT "PairNote_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
