-- MERCADOPAGO-PIX-WEBHOOK-ANTI-REPLAY-FIX1
-- Persistent receipt, lease and replay guard for authenticated webhook deliveries.

CREATE TYPE "PaymentWebhookDeliveryStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "payment_webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" "PaymentProviderCode" NOT NULL,
  "environment" "PaymentProviderEnvironment" NOT NULL,
  "accountIdHash" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "signatureTimestamp" BIGINT NOT NULL,
  "signatureDigest" TEXT NOT NULL,
  "status" "PaymentWebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "paymentIntentId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_deliveries_identity_key"
  ON "payment_webhook_deliveries"(
    "provider",
    "environment",
    "accountIdHash",
    "requestId",
    "resourceId"
  );

CREATE INDEX "payment_webhook_deliveries_status_leaseExpiresAt_idx"
  ON "payment_webhook_deliveries"("status", "leaseExpiresAt");

CREATE INDEX "payment_webhook_deliveries_paymentIntentId_idx"
  ON "payment_webhook_deliveries"("paymentIntentId");

CREATE INDEX "payment_webhook_deliveries_createdAt_idx"
  ON "payment_webhook_deliveries"("createdAt");

ALTER TABLE "payment_webhook_deliveries"
  ADD CONSTRAINT "payment_webhook_deliveries_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId")
  REFERENCES "payment_intents"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
