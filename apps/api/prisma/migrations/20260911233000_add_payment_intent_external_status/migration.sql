-- AlterEnum
ALTER TYPE "PaymentIntentStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN "externalStatus" TEXT,
ADD COLUMN "externalDepixId" TEXT,
ADD COLUMN "blockchainTxId" TEXT;
