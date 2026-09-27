ALTER TYPE "FinancialTransactionOrigin" ADD VALUE 'LEGACY_IMPORT';

CREATE TYPE "FinancialPaymentMethod" AS ENUM ('PIX', 'BOLETO', 'CARTAO', 'TRANSFERENCIA');

ALTER TABLE "financial_transactions"
  ADD COLUMN "paymentMethod" "FinancialPaymentMethod";

CREATE TABLE "legacy_financial_import_records" (
  "id" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "legacyPaymentId" TEXT NOT NULL,
  "legacyClientId" TEXT NOT NULL,
  "crmClientId" UUID,
  "crmClientReferenceId" UUID,
  "financialTransactionId" UUID,
  "receivableId" UUID,
  "payloadHash" VARCHAR(64) NOT NULL,
  "status" "LegacyImportRecordStatus" NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "legacy_financial_import_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legacy_financial_import_records_source_legacyPaymentId_key"
  ON "legacy_financial_import_records"("source", "legacyPaymentId");

CREATE INDEX "financial_transactions_paymentMethod_idx"
  ON "financial_transactions"("paymentMethod");

CREATE INDEX "legacy_financial_import_records_legacyClientId_idx"
  ON "legacy_financial_import_records"("legacyClientId");

CREATE INDEX "legacy_financial_import_records_crmClientId_idx"
  ON "legacy_financial_import_records"("crmClientId");

CREATE INDEX "legacy_financial_import_records_crmClientReferenceId_idx"
  ON "legacy_financial_import_records"("crmClientReferenceId");

CREATE INDEX "legacy_financial_import_records_financialTransactionId_idx"
  ON "legacy_financial_import_records"("financialTransactionId");

CREATE INDEX "legacy_financial_import_records_receivableId_idx"
  ON "legacy_financial_import_records"("receivableId");

CREATE INDEX "legacy_financial_import_records_status_idx"
  ON "legacy_financial_import_records"("status");

CREATE INDEX "legacy_financial_import_records_createdAt_idx"
  ON "legacy_financial_import_records"("createdAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "financial_categories"
    WHERE lower("name") = lower('Receita histórica')
      AND "type" = 'ENTRADA'
      AND "active" = false
  ) THEN
    RAISE EXCEPTION 'Categoria financeira "Receita histórica" ENTRADA existe, mas está inativa. Revise manualmente antes de aplicar IMPORT2.1.';
  END IF;
END $$;

INSERT INTO "financial_categories" ("id", "name", "type", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Receita histórica', 'ENTRADA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "financial_categories"
  WHERE lower("name") = lower('Receita histórica') AND "type" = 'ENTRADA'
);
