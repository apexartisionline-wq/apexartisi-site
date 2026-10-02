-- CreateEnum
CREATE TYPE "TherapistKind" AS ENUM ('BIOMATIC', 'CLINICAL', 'BOTH');

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('CANCEL', 'CHANGE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'DONE', 'DECLINED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "alternationOk" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "kind" "TherapistKind";

-- AlterTable
ALTER TABLE "Cycle" ADD COLUMN     "settledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "memberCode" TEXT,
ADD COLUMN     "notifyPrefs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "therapistKind" "TherapistKind";

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "memberId" TEXT NOT NULL,
    "kind" "RequestKind" NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "sessionAt" TIMESTAMP(3) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reply" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSession" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "coordinatorId" TEXT,
    "theme" TEXT NOT NULL DEFAULT '',
    "atmosphere" TEXT NOT NULL DEFAULT '',
    "noteById" TEXT,
    "noteAt" TIMESTAMP(3),

    CONSTRAINT "GroupSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMention" (
    "id" TEXT NOT NULL,
    "groupSessionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "GroupMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSession_date_time_key" ON "GroupSession"("date", "time");

-- CreateIndex
CREATE INDEX "GroupMention_memberId_idx" ON "GroupMention"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "User_memberCode_key" ON "User"("memberCode");

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSession" ADD CONSTRAINT "GroupSession_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMention" ADD CONSTRAINT "GroupMention_groupSessionId_fkey" FOREIGN KEY ("groupSessionId") REFERENCES "GroupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMention" ADD CONSTRAINT "GroupMention_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Υπάρχοντες κύκλοι: θεωρούνται τακτοποιημένοι.
UPDATE "Cycle" SET "settledAt" = "startedAt" WHERE "settledAt" IS NULL;

-- Κωδικός μέλους για όσα μέλη υπάρχουν ήδη.
UPDATE "User" SET "memberCode" = 'A-' || upper(substr(md5(random()::text || id), 1, 5))
WHERE role = 'MEMBER' AND "memberCode" IS NULL;
