-- MANUALPIX1 phase 1: schema and database invariants for manual PIX charges.

CREATE TYPE "ReceivableAuditEventType" AS ENUM (
  'MANUAL_CHARGE_CREATED',
  'PIX_CREATED',
  'PIX_REPLACED',
  'WHATSAPP_SENT',
  'PAID',
  'CANCELED'
);

ALTER TABLE "receivables"
  ALTER COLUMN "clientId" DROP NOT NULL,
  ALTER COLUMN "clientReferenceId" DROP NOT NULL,
  ADD COLUMN "payerName" TEXT,
  ADD COLUMN "payerPhone" TEXT,
  ADD COLUMN "payerPhoneNormalized" TEXT,
  ADD COLUMN "financialCategoryId" UUID,
  ADD COLUMN "manualChargeIdempotencyKey" TEXT;

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_financialCategoryId_fkey"
  FOREIGN KEY ("financialCategoryId")
  REFERENCES "financial_categories"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_cycle_requires_client_and_reference_chk"
  CHECK (
    "purpose" NOT IN ('RENEWAL', 'INITIAL_ACTIVATION', 'REACTIVATION')
    OR ("clientId" IS NOT NULL AND "clientReferenceId" IS NOT NULL)
  );

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_manual_charge_shape_chk"
  CHECK (
    "purpose" <> 'MANUAL_CHARGE'
    OR (
      "clientReferenceId" IS NULL
      AND "financialCategoryId" IS NOT NULL
      AND "payerName" IS NOT NULL
      AND btrim("payerName") <> ''
      AND "payerPhoneNormalized" IS NOT NULL
      AND btrim("payerPhoneNormalized") <> ''
    )
  );

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_manual_charge_idempotency_scope_chk"
  CHECK (
    "manualChargeIdempotencyKey" IS NULL
    OR "purpose" = 'MANUAL_CHARGE'
  );

DROP INDEX IF EXISTS "receivables_clientReferenceId_purpose_dueDate_key";

CREATE UNIQUE INDEX "receivables_cycle_unique"
  ON "receivables"("clientReferenceId", "purpose", "dueDate")
  WHERE "purpose" IN ('RENEWAL', 'INITIAL_ACTIVATION', 'REACTIVATION');

CREATE UNIQUE INDEX "receivables_manual_charge_idempotency_key_unique"
  ON "receivables"("manualChargeIdempotencyKey")
  WHERE "purpose" = 'MANUAL_CHARGE'
    AND "manualChargeIdempotencyKey" IS NOT NULL;

CREATE INDEX "receivables_financialCategoryId_idx"
  ON "receivables"("financialCategoryId");

CREATE INDEX "receivables_payerPhoneNormalized_idx"
  ON "receivables"("payerPhoneNormalized");

CREATE INDEX "receivables_manualChargeIdempotencyKey_idx"
  ON "receivables"("manualChargeIdempotencyKey");

CREATE TABLE "receivable_audit_events" (
  "id" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "paymentIntentId" UUID,
  "messageDispatchId" UUID,
  "eventType" "ReceivableAuditEventType" NOT NULL,
  "actorUserId" UUID,
  "provider" "PaymentProviderCode",
  "providerTransactionId" TEXT,
  "payerNameSnapshot" TEXT,
  "payerPhoneMasked" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "receivable_audit_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "receivable_audit_events"
  ADD CONSTRAINT "receivable_audit_events_receivableId_fkey"
  FOREIGN KEY ("receivableId")
  REFERENCES "receivables"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "receivable_audit_events"
  ADD CONSTRAINT "receivable_audit_events_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId")
  REFERENCES "payment_intents"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "receivable_audit_events"
  ADD CONSTRAINT "receivable_audit_events_messageDispatchId_fkey"
  FOREIGN KEY ("messageDispatchId")
  REFERENCES "message_dispatches"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "receivable_audit_events"
  ADD CONSTRAINT "receivable_audit_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "receivable_audit_events_receivableId_idx"
  ON "receivable_audit_events"("receivableId");

CREATE INDEX "receivable_audit_events_paymentIntentId_idx"
  ON "receivable_audit_events"("paymentIntentId");

CREATE INDEX "receivable_audit_events_messageDispatchId_idx"
  ON "receivable_audit_events"("messageDispatchId");

CREATE INDEX "receivable_audit_events_eventType_idx"
  ON "receivable_audit_events"("eventType");

CREATE INDEX "receivable_audit_events_actorUserId_idx"
  ON "receivable_audit_events"("actorUserId");

CREATE INDEX "receivable_audit_events_provider_providerTransactionId_idx"
  ON "receivable_audit_events"("provider", "providerTransactionId");

CREATE INDEX "receivable_audit_events_createdAt_idx"
  ON "receivable_audit_events"("createdAt");
