-- Βήματα: η διαχείριση στέλνει εργασίες-βήματα· το μέλος δηλώνει σε ποιο βήμα βρίσκεται.
ALTER TABLE "Assignment" ADD COLUMN "step" INTEGER;

CREATE TABLE "MemberStep" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberStep_memberId_createdAt_idx" ON "MemberStep"("memberId", "createdAt");
