-- CreateTable
CREATE TABLE "IntakeCheck" (
    "memberId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneById" TEXT NOT NULL,

    CONSTRAINT "IntakeCheck_pkey" PRIMARY KEY ("memberId","key")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consent_memberId_purpose_recordedAt_idx" ON "Consent"("memberId", "purpose", "recordedAt");

