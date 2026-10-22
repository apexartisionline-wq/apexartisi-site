-- Φόρμες της θεματικής μέσα στο Apex (22/10): ερωτήσεις στο Content, απαντήσεις μελών κρυπτογραφημένες, κάθε αποθήκευση νέα έκδοση.
-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "questions" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "FormAnswer" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormAnswer_memberId_contentId_createdAt_idx" ON "FormAnswer"("memberId", "contentId", "createdAt");

-- CreateIndex
CREATE INDEX "FormAnswer_contentId_idx" ON "FormAnswer"("contentId");

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

