-- Όπου υπάρχει σημείωμα, η ατομική έγινε: το μέλος μετράει «ήρθε».
UPDATE "Booking" b SET "joinedAt" = s."startsAt"
FROM "Slot" s
WHERE b."slotId" = s."id" AND b."joinedAt" IS NULL
  AND s."startsAt" <= NOW()
  AND EXISTS (SELECT 1 FROM "SessionNote" n WHERE n."slotId" = s."id");
