CREATE TYPE "FinancialTransactionType" AS ENUM ('ENTRADA', 'SAIDA');
CREATE TYPE "FinancialTransactionOrigin" AS ENUM ('RECEIVABLE_PAYMENT', 'MANUAL');
ALTER TYPE "ClientEventType" ADD VALUE 'PAYMENT_REGISTERED';
ALTER TYPE "ClientEventType" ADD VALUE 'RECEIVABLE_CANCELED';
ALTER TYPE "ClientEventType" ADD VALUE 'FINANCIAL_TRANSACTION_CREATED';

ALTER TABLE "receivables" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "receivables" ALTER COLUMN "paidAt" TYPE DATE USING "paidAt"::date;

CREATE TABLE "financial_categories" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "FinancialTransactionType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_transactions" (
  "id" UUID NOT NULL,
  "type" "FinancialTransactionType" NOT NULL,
  "origin" "FinancialTransactionOrigin" NOT NULL DEFAULT 'MANUAL',
  "categoryId" UUID NOT NULL,
  "clientId" UUID,
  "receivableId" UUID,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "transactionDate" DATE NOT NULL,
  "notes" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_categories_name_type_key" ON "financial_categories"("name", "type");
CREATE INDEX "financial_categories_type_idx" ON "financial_categories"("type");
CREATE INDEX "financial_categories_active_idx" ON "financial_categories"("active");
CREATE UNIQUE INDEX "financial_transactions_receivableId_key" ON "financial_transactions"("receivableId");
CREATE INDEX "financial_transactions_type_idx" ON "financial_transactions"("type");
CREATE INDEX "financial_transactions_origin_idx" ON "financial_transactions"("origin");
CREATE INDEX "financial_transactions_categoryId_idx" ON "financial_transactions"("categoryId");
CREATE INDEX "financial_transactions_clientId_idx" ON "financial_transactions"("clientId");
CREATE INDEX "financial_transactions_transactionDate_idx" ON "financial_transactions"("transactionDate");
CREATE INDEX "financial_transactions_createdAt_idx" ON "financial_transactions"("createdAt");

ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
