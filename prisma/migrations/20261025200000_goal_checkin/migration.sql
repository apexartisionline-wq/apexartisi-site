-- Συνέπεια με τον στόχο της εβδομάδας χωριστά από το ημερολόγιο (υπεύθυνη 25/10).
CREATE TABLE "GoalCheckIn" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoalCheckIn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoalCheckIn_memberId_date_key" ON "GoalCheckIn"("memberId", "date");
ALTER TABLE "GoalCheckIn" ADD CONSTRAINT "GoalCheckIn_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Οι παλιές απαντήσεις από το ημερολόγιο περνούν στον νέο πίνακα (ίδια μέρα, ίδια σημείωση).
INSERT INTO "GoalCheckIn" ("id", "memberId", "date", "check", "note", "createdAt", "updatedAt")
SELECT 'gc_' || "id", "memberId", "date", "goalCheck", "goalNote", "createdAt", "updatedAt"
FROM "JournalEntry" WHERE "goalCheck" IN ('YES', 'PARTLY', 'NO');
