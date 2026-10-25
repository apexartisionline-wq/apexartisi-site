-- Απόφοιτοι (25/10): ημερομηνία αποφοίτησης στο μέλος, «πληρώθηκε» ανά ατομική αποφοίτου.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "alumniSince" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paidAt" TIMESTAMP(3);
