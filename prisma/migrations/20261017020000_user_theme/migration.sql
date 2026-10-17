-- Χρωματικό θέμα ανά χρήστη (17/10): φωτεινό από προεπιλογή, σκούρο μόνο με επιλογή του.
ALTER TABLE "User" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'light';
