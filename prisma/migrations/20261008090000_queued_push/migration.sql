-- CreateTable
CREATE TABLE "QueuedPush" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "msg" JSONB NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "QueuedPush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueuedPush_sentAt_sendAt_idx" ON "QueuedPush"("sentAt", "sendAt");
