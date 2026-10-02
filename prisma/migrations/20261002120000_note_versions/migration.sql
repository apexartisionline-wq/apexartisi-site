-- CreateTable
CREATE TABLE "SessionNoteVersion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "riskChange" TEXT,
    "usedSince" TEXT,
    "nextStep" TEXT NOT NULL DEFAULT '',
    "editorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionNoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionNoteVersion_noteId_createdAt_idx" ON "SessionNoteVersion"("noteId", "createdAt");
