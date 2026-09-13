CREATE TABLE "client_references" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "planId" UUID NOT NULL,
  "recurringValue" DECIMAL(12,2) NOT NULL,
  "dueDate" DATE NOT NULL,
  "billingAnchorDay" INTEGER NOT NULL,
  "billingNoticeDays" INTEGER NOT NULL,
  "status" "ClientStatus" NOT NULL DEFAULT 'ATIVO',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_references_pkey" PRIMARY KEY ("id")
);

INSERT INTO "client_references" (
  "id",
  "clientId",
  "reference",
  "planId",
  "recurringValue",
  "dueDate",
  "billingAnchorDay",
  "billingNoticeDays",
  "status",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "id",
  "reference",
  "planId",
  "recurringValue",
  "dueDate",
  "billingAnchorDay",
  "billingNoticeDays",
  "status",
  NULL,
  "createdAt",
  "updatedAt"
FROM "clients";

CREATE UNIQUE INDEX "client_references_reference_key" ON "client_references"("reference");
CREATE INDEX "client_references_clientId_idx" ON "client_references"("clientId");
CREATE INDEX "client_references_planId_idx" ON "client_references"("planId");
CREATE INDEX "client_references_status_idx" ON "client_references"("status");
CREATE INDEX "client_references_dueDate_idx" ON "client_references"("dueDate");
CREATE INDEX "client_references_createdAt_idx" ON "client_references"("createdAt");

ALTER TABLE "client_references"
  ADD CONSTRAINT "client_references_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_references"
  ADD CONSTRAINT "client_references_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "renewals" ADD COLUMN "clientReferenceId" UUID;
UPDATE "renewals" r
SET "clientReferenceId" = cr."id"
FROM "client_references" cr
WHERE cr."clientId" = r."clientId";
ALTER TABLE "renewals" ALTER COLUMN "clientReferenceId" SET NOT NULL;
CREATE UNIQUE INDEX "renewals_clientReferenceId_idempotencyKey_key" ON "renewals"("clientReferenceId", "idempotencyKey");
CREATE INDEX "renewals_clientReferenceId_idx" ON "renewals"("clientReferenceId");
ALTER TABLE "renewals"
  ADD CONSTRAINT "renewals_clientReferenceId_fkey"
  FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivables" ADD COLUMN "clientReferenceId" UUID;
UPDATE "receivables" r
SET "clientReferenceId" = cr."id"
FROM "client_references" cr
WHERE cr."clientId" = r."clientId";
ALTER TABLE "receivables" ALTER COLUMN "clientReferenceId" SET NOT NULL;
CREATE INDEX "receivables_clientReferenceId_idx" ON "receivables"("clientReferenceId");
ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_clientReferenceId_fkey"
  FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recovery_campaigns" ADD COLUMN "clientReferenceId" UUID;
UPDATE "recovery_campaigns" r
SET "clientReferenceId" = cr."id"
FROM "client_references" cr
WHERE cr."clientId" = r."clientId";
ALTER TABLE "recovery_campaigns" ALTER COLUMN "clientReferenceId" SET NOT NULL;
CREATE INDEX "recovery_campaigns_clientReferenceId_idx" ON "recovery_campaigns"("clientReferenceId");
ALTER TABLE "recovery_campaigns"
  ADD CONSTRAINT "recovery_campaigns_clientReferenceId_fkey"
  FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "message_dispatches" ADD COLUMN "clientReferenceId" UUID;
UPDATE "message_dispatches" m
SET "clientReferenceId" = COALESCE(
  (SELECT rec."clientReferenceId" FROM "receivables" rec WHERE rec."id" = m."receivableId"),
  (SELECT rc."clientReferenceId" FROM "recovery_campaigns" rc WHERE rc."id" = m."recoveryCampaignId"),
  (SELECT cr."id" FROM "client_references" cr WHERE cr."clientId" = m."clientId" ORDER BY cr."createdAt" ASC LIMIT 1)
);
CREATE INDEX "message_dispatches_clientReferenceId_idx" ON "message_dispatches"("clientReferenceId");
ALTER TABLE "message_dispatches"
  ADD CONSTRAINT "message_dispatches_clientReferenceId_fkey"
  FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_status_history" ADD COLUMN "clientReferenceId" UUID;
UPDATE "client_status_history" h
SET "clientReferenceId" = cr."id"
FROM "client_references" cr
WHERE cr."clientId" = h."clientId";
CREATE INDEX "client_status_history_clientReferenceId_idx" ON "client_status_history"("clientReferenceId");
ALTER TABLE "client_status_history"
  ADD CONSTRAINT "client_status_history_clientReferenceId_fkey"
  FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "referrals" ADD COLUMN "rewardClientReferenceId" UUID;
CREATE INDEX "referrals_rewardClientReferenceId_idx" ON "referrals"("rewardClientReferenceId");
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_rewardClientReferenceId_fkey"
  FOREIGN KEY ("rewardClientReferenceId") REFERENCES "client_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_transactions" ADD COLUMN "clientReferenceId" UUID;
UPDATE "financial_transactions" ft
SET "clientReferenceId" = COALESCE(
  (SELECT rec."clientReferenceId" FROM "receivables" rec WHERE rec."id" = ft."receivableId"),
  (SELECT cr."id" FROM "client_references" cr WHERE cr."clientId" = ft."clientId" ORDER BY cr."createdAt" ASC LIMIT 1)
);
CREATE INDEX "financial_transactions_clientReferenceId_idx" ON "financial_transactions"("clientReferenceId");
ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_clientReferenceId_fkey"
  FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "clients_phoneNormalized_key";
