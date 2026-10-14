-- Κλείσιμο κύκλου (απόφαση 14/10): προαιρετικό «κάτι επιπλέον» και στιγμιότυπο της αυτόματης σύνοψης, αρχειοθετημένο στον φάκελο.
ALTER TABLE "CycleReview" ADD COLUMN "note" TEXT NOT NULL DEFAULT '', ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';
