-- Μηνύματα μέσα στην ομάδα (θεραπευτής ↔ θεραπευτής / διαχείριση).
CREATE TABLE "StaffMessage" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "StaffMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffMessage_toId_readAt_idx" ON "StaffMessage"("toId", "readAt");
CREATE INDEX "StaffMessage_fromId_toId_createdAt_idx" ON "StaffMessage"("fromId", "toId", "createdAt");
