-- AlterEnum
ALTER TYPE "ClientEventType" ADD VALUE 'PIX_PAYMENT_STATUS_UPDATED';

-- AlterTable
ALTER TABLE "payment_provider_credentials"
ADD COLUMN "webhookSecretEncrypted" TEXT,
ADD COLUMN "webhookSecretLastFour" TEXT,
ADD COLUMN "webhookConfiguredAt" TIMESTAMP(3),
ADD COLUMN "webhookUrl" TEXT,
ADD COLUMN "webhookRegisteredAt" TIMESTAMP(3),
ADD COLUMN "defaultForPix" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProviderCode" NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "paymentIntentId" UUID,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_providerTransactionId_status_eventKey_key" ON "payment_webhook_events"("provider", "providerTransactionId", "status", "eventKey");

-- CreateIndex
CREATE INDEX "payment_webhook_events_provider_idx" ON "payment_webhook_events"("provider");

-- CreateIndex
CREATE INDEX "payment_webhook_events_providerTransactionId_idx" ON "payment_webhook_events"("providerTransactionId");

-- CreateIndex
CREATE INDEX "payment_webhook_events_paymentIntentId_idx" ON "payment_webhook_events"("paymentIntentId");

-- CreateIndex
CREATE INDEX "payment_provider_credentials_defaultForPix_idx" ON "payment_provider_credentials"("defaultForPix");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_credentials_one_default_provider_v1_idx" ON "payment_provider_credentials"("defaultForPix") WHERE "defaultForPix" = true AND "active" = true AND "companyId" IS NULL;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
