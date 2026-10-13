-- Παρουσίες (απόφαση 13/10): η επιβεβαίωση του θεραπευτή χωριστά από το πάτημα «Μπες» του μέλους.
ALTER TABLE "Booking" ADD COLUMN "confirmedCame" BOOLEAN;
ALTER TABLE "Booking" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "confirmedById" TEXT;

-- Μεταφορά της υπάρχουσας πληροφορίας χωρίς να αλλάξει κανένας αριθμός:
-- μέχρι σήμερα, όπου υπήρχε σημείωμα, το joinedAt έλεγε «Ήρθε» (ορισμένο) ή «Δεν ήρθε» (κενό).
-- Ατομική: το κοινό σημείωμα της θέσης. Therapair: μόνο το δικό του σημείωμα του μέλους (ποτέ το παλιό κοινό).
UPDATE "Booking" b
SET "confirmedCame" = (b."joinedAt" IS NOT NULL),
    "confirmedAt" = COALESCE(
      (SELECT n."updatedAt" FROM "SessionNote" n JOIN "Slot" s ON s."id" = n."slotId" WHERE n."slotId" = b."slotId" AND s."kind" <> 'PAIR'),
      (SELECT p."updatedAt" FROM "PairNote" p WHERE p."slotId" = b."slotId" AND p."memberId" = b."memberId")),
    "confirmedById" = COALESCE(
      (SELECT n."therapistId" FROM "SessionNote" n JOIN "Slot" s ON s."id" = n."slotId" WHERE n."slotId" = b."slotId" AND s."kind" <> 'PAIR'),
      (SELECT p."therapistId" FROM "PairNote" p WHERE p."slotId" = b."slotId" AND p."memberId" = b."memberId"))
WHERE EXISTS (SELECT 1 FROM "SessionNote" n JOIN "Slot" s ON s."id" = n."slotId" WHERE n."slotId" = b."slotId" AND s."kind" <> 'PAIR')
   OR EXISTS (SELECT 1 FROM "PairNote" p WHERE p."slotId" = b."slotId" AND p."memberId" = b."memberId");

-- Πραγματικό πρόγραμμα ομάδων: γεγονότα με ημερομηνία και ακύρωση.
ALTER TABLE "GroupSession" ADD COLUMN "fromProgramme" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GroupSession" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "GroupSession" ADD COLUMN "cancelledById" TEXT;
ALTER TABLE "GroupSession" ADD COLUMN "cancelReason" TEXT NOT NULL DEFAULT '';
