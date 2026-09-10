CREATE TYPE "ReceivableStatus" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO');
ALTER TYPE "ClientEventType" ADD VALUE 'CLIENT_RENEWED';

ALTER TABLE "clients" ADD COLUMN "billingAnchorDay" INTEGER;

UPDATE "clients"
SET "billingAnchorDay" = EXTRACT(DAY FROM "dueDate")::INTEGER
WHERE "billingAnchorDay" IS NULL;

CREATE TABLE "renewals" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "previousDueDate" DATE NOT NULL,
  "newDueDate" DATE NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "planName" TEXT NOT NULL,
  "durationMonths" INTEGER NOT NULL,
  "idempotencyKey" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "renewals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receivables" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "renewalId" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "dueDate" DATE NOT NULL,
  "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDENTE',
  "paidAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "renewals_clientId_idempotencyKey_key" ON "renewals"("clientId", "idempotencyKey");
CREATE INDEX "renewals_clientId_idx" ON "renewals"("clientId");
CREATE INDEX "renewals_planId_idx" ON "renewals"("planId");
CREATE INDEX "renewals_createdAt_idx" ON "renewals"("createdAt");
CREATE UNIQUE INDEX "receivables_renewalId_key" ON "receivables"("renewalId");
CREATE INDEX "receivables_clientId_idx" ON "receivables"("clientId");
CREATE INDEX "receivables_dueDate_idx" ON "receivables"("dueDate");
CREATE INDEX "receivables_status_idx" ON "receivables"("status");

ALTER TABLE "renewals" ADD CONSTRAINT "renewals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "renewals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
