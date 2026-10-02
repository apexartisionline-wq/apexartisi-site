-- CreateTable
CREATE TABLE "StaffJoin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffJoin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffJoin_kind_ref_idx" ON "StaffJoin"("kind", "ref");

-- CreateIndex
CREATE INDEX "StaffJoin_userId_at_idx" ON "StaffJoin"("userId", "at");
