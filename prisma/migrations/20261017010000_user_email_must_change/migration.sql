-- Email καλωσορίσματος σε νέο μέλος (16/10): email λογαριασμού και υποχρεωτική αλλαγή κωδικού στην 1η είσοδο.
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "mustChangeCode" BOOLEAN NOT NULL DEFAULT false;
