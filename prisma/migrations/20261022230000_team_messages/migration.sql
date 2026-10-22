-- Μηνύματα της διαχείρισης προς μέλη (22/10): μόνο προς το μέλος, κρυπτογραφημένα· και το μήνυμα ολοκλήρωσης κύκλου.
-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'admin',
    "text" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamMessage_memberId_readAt_idx" ON "TeamMessage"("memberId", "readAt");

-- CreateIndex
CREATE INDEX "TeamMessage_createdAt_idx" ON "TeamMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
