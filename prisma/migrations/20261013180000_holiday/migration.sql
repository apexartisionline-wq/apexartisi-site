-- Αργία: μόνο προσθήκη πίνακα (υπεύθυνη 13/10).
CREATE TABLE "Holiday" (
    "date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "groupTime" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("date")
);
