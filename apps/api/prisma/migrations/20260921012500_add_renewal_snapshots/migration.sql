-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('ACTIVE', 'REVERTED');

-- AlterTable
ALTER TABLE "renewals"
  ADD COLUMN "previousPlanId" UUID,
  ADD COLUMN "previousPlanName" TEXT,
  ADD COLUMN "previousAmount" DECIMAL(12,2),
  ADD COLUMN "previousBillingAnchorDay" INTEGER,
  ADD COLUMN "previousStatus" "ClientStatus",
  ADD COLUMN "newBillingAnchorDay" INTEGER,
  ADD COLUMN "newStatus" "ClientStatus",
  ADD COLUMN "status" "RenewalStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "renewal_reversals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "renewalId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "clientReferenceId" UUID NOT NULL,
  "previousPlanId" UUID,
  "previousPlanName" TEXT,
  "previousAmount" DECIMAL(12,2),
  "previousDueDate" DATE,
  "previousBillingAnchorDay" INTEGER,
  "previousStatus" "ClientStatus",
  "revertedFromPlanId" UUID,
  "revertedFromPlanName" TEXT,
  "revertedFromAmount" DECIMAL(12,2),
  "revertedFromDueDate" DATE,
  "revertedFromBillingAnchorDay" INTEGER,
  "revertedFromStatus" "ClientStatus",
  "reason" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "renewal_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "renewal_reversals_renewalId_key" ON "renewal_reversals"("renewalId");
CREATE INDEX "renewal_reversals_clientId_idx" ON "renewal_reversals"("clientId");
CREATE INDEX "renewal_reversals_clientReferenceId_idx" ON "renewal_reversals"("clientReferenceId");
CREATE INDEX "renewal_reversals_createdAt_idx" ON "renewal_reversals"("createdAt");

-- AddForeignKey
ALTER TABLE "renewal_reversals" ADD CONSTRAINT "renewal_reversals_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "renewals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_reversals" ADD CONSTRAINT "renewal_reversals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_reversals" ADD CONSTRAINT "renewal_reversals_clientReferenceId_fkey" FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_reversals" ADD CONSTRAINT "renewal_reversals_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
