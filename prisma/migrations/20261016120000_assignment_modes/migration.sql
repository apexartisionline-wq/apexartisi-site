-- Βήματα με τρεις τρόπους (16/10): φόρμα μέσα στο Apex, PDF που το μέλος γράφει στο τετράδιο, PDF που το μέλος συμπληρώνει.
ALTER TABLE "Assignment" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'FORM';
ALTER TABLE "Assignment" ADD COLUMN "pdf" BYTEA;
ALTER TABLE "Assignment" ADD COLUMN "pdfName" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "answerPdf" BYTEA;
ALTER TABLE "Assignment" ADD COLUMN "answerPdfName" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "answerPdfAt" TIMESTAMP(3);
ALTER TABLE "Assignment" ADD COLUMN "notebookAt" TIMESTAMP(3);
