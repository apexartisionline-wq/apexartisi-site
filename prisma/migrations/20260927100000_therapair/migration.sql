-- CreateEnum
CREATE TYPE "SlotKind" AS ENUM ('INDIVIDUAL', 'PAIR');

-- DropForeignKey
ALTER TABLE "SessionNote" DROP CONSTRAINT "SessionNote_bookingId_fkey";

-- DropIndex
DROP INDEX "Booking_slotId_key";

-- DropIndex
DROP INDEX "SessionNote_bookingId_key";

-- Τα υπάρχοντα σημειώματα περνούν από την κράτηση στη θέση της.
ALTER TABLE "SessionNote" ADD COLUMN "slotId" TEXT;
UPDATE "SessionNote" n SET "slotId" = b."slotId" FROM "Booking" b WHERE b.id = n."bookingId";
ALTER TABLE "SessionNote" ALTER COLUMN "slotId" SET NOT NULL;
ALTER TABLE "SessionNote" DROP COLUMN "bookingId";

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "kind" "SlotKind" NOT NULL DEFAULT 'INDIVIDUAL';

-- CreateIndex
CREATE UNIQUE INDEX "Booking_slotId_memberId_key" ON "Booking"("slotId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionNote_slotId_key" ON "SessionNote"("slotId");

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

