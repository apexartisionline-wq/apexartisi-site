-- Εικόνα στο «Κείμενο της ημέρας» (κάρτες κινήτρων κάθε πρωί) και εικόνες στη Βιβλιοθήκη (απόφαση 14/10).
ALTER TYPE "LibraryKind" ADD VALUE 'IMAGE';
ALTER TABLE "Content" ADD COLUMN "imageMime" TEXT, ADD COLUMN "image" BYTEA;
