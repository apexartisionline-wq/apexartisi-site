-- Απλή αρχική για επισκέπτη / νέο συνεργάτη (20/10): μόνο πρόγραμμα, 2 γραμμές πίνακα, μενού· χωρίς πύλη σημειώματος.
ALTER TABLE "User" ADD COLUMN "simpleHome" BOOLEAN NOT NULL DEFAULT false;
