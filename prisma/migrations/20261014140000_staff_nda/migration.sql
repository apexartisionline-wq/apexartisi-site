-- Έντυπο εχεμύθειας (απόφαση 14/10): έγγραφο με εκδόσεις, συναίνεση ανά συνεργάτη, εξαίρεση υπεύθυνης.
ALTER TABLE "User" ADD COLUMN "ndaExempt" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StaffDocument" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NDA',
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "file" BYTEA NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffDocument_kind_version_key" ON "StaffDocument"("kind", "version");

CREATE TABLE "StaffConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "typedName" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "signedFileName" TEXT,
    "signedMime" TEXT,
    "signedFile" BYTEA,
    "signedHow" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedById" TEXT,
    "signedNote" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "StaffConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffConsent_userId_documentId_key" ON "StaffConsent"("userId", "documentId");
CREATE INDEX "StaffConsent_userId_idx" ON "StaffConsent"("userId");
ALTER TABLE "StaffConsent" ADD CONSTRAINT "StaffConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffConsent" ADD CONSTRAINT "StaffConsent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StaffDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
