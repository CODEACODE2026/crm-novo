-- AlterEnum
ALTER TYPE "ClientEventType" ADD VALUE 'RENEWAL_REVERTED';

-- AlterTable
ALTER TABLE "renewal_reversals" ADD COLUMN "idempotencyKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "renewal_reversals_clientReferenceId_idempotencyKey_key" ON "renewal_reversals"("clientReferenceId", "idempotencyKey");
