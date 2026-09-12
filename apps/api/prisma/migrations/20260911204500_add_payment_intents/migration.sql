-- CreateEnum
CREATE TYPE "PaymentProviderCode" AS ENUM ('MOCK');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('CREATED', 'WAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELED', 'FAILED');

-- AlterEnum
ALTER TYPE "ClientEventType" ADD VALUE 'PIX_PAYMENT_INTENT_CREATED';

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "provider" "PaymentProviderCode" NOT NULL,
    "providerTransactionId" TEXT,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
    "amount" DECIMAL(12,2) NOT NULL,
    "pixCopyPaste" TEXT,
    "qrCodeData" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_provider_providerTransactionId_key" ON "payment_intents"("provider", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_one_active_per_receivable_idx" ON "payment_intents"("receivableId") WHERE "status" IN ('CREATED', 'WAITING_PAYMENT');

-- CreateIndex
CREATE INDEX "payment_intents_receivableId_idx" ON "payment_intents"("receivableId");

-- CreateIndex
CREATE INDEX "payment_intents_provider_idx" ON "payment_intents"("provider");

-- CreateIndex
CREATE INDEX "payment_intents_status_idx" ON "payment_intents"("status");

-- CreateIndex
CREATE INDEX "payment_intents_expiresAt_idx" ON "payment_intents"("expiresAt");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
