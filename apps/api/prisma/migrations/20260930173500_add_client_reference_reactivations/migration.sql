ALTER TYPE "ClientEventType" ADD VALUE 'CLIENT_REFERENCE_REACTIVATION_REQUESTED';
ALTER TYPE "ClientEventType" ADD VALUE 'CLIENT_REFERENCE_REACTIVATED';

ALTER TYPE "ReceivablePurpose" ADD VALUE 'REACTIVATION';

CREATE TYPE "ClientReferenceReactivationStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

CREATE TABLE "client_reference_reactivations" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "clientReferenceId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "previousPlanId" UUID,
  "previousPlanName" TEXT,
  "previousAmount" DECIMAL(12, 2),
  "previousDueDate" DATE,
  "previousBillingAnchorDay" INTEGER,
  "previousStatus" "ClientStatus",
  "activationDate" DATE NOT NULL,
  "billingAnchorDay" INTEGER NOT NULL,
  "recurringValue" DECIMAL(12, 2) NOT NULL,
  "status" "ClientReferenceReactivationStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" UUID,
  "paidAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "client_reference_reactivations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_reference_reactivations_receivableId_key"
  ON "client_reference_reactivations"("receivableId");

CREATE UNIQUE INDEX "client_reference_reactivations_clientReferenceId_idempotencyKey_key"
  ON "client_reference_reactivations"("clientReferenceId", "idempotencyKey");

CREATE UNIQUE INDEX "client_reference_reactivations_single_pending_key"
  ON "client_reference_reactivations"("clientReferenceId")
  WHERE "status" = 'PENDING';

CREATE INDEX "client_reference_reactivations_clientId_idx"
  ON "client_reference_reactivations"("clientId");

CREATE INDEX "client_reference_reactivations_clientReferenceId_idx"
  ON "client_reference_reactivations"("clientReferenceId");

CREATE INDEX "client_reference_reactivations_planId_idx"
  ON "client_reference_reactivations"("planId");

CREATE INDEX "client_reference_reactivations_status_idx"
  ON "client_reference_reactivations"("status");

ALTER TABLE "client_reference_reactivations"
  ADD CONSTRAINT "client_reference_reactivations_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_reference_reactivations"
  ADD CONSTRAINT "client_reference_reactivations_clientReferenceId_fkey"
  FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_reference_reactivations"
  ADD CONSTRAINT "client_reference_reactivations_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_reference_reactivations"
  ADD CONSTRAINT "client_reference_reactivations_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_reference_reactivations"
  ADD CONSTRAINT "client_reference_reactivations_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
