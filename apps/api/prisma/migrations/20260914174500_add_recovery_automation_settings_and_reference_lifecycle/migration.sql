ALTER TABLE "client_references"
  ADD COLUMN "inactivatedAt" TIMESTAMP(3),
  ADD COLUMN "inactivationReason" TEXT,
  ADD COLUMN "inactivatedByUserId" UUID,
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "canceledByUserId" UUID;

CREATE INDEX "client_references_inactivatedAt_idx" ON "client_references"("inactivatedAt");
CREATE INDEX "client_references_canceledAt_idx" ON "client_references"("canceledAt");

ALTER TABLE "client_references"
  ADD CONSTRAINT "client_references_inactivatedByUserId_fkey"
  FOREIGN KEY ("inactivatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_references"
  ADD CONSTRAINT "client_references_canceledByUserId_fkey"
  FOREIGN KEY ("canceledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "recovery_automation_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" TEXT NOT NULL DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "sendTime" VARCHAR(5) NOT NULL DEFAULT '09:00',
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "sendIntervalSeconds" INTEGER NOT NULL DEFAULT 8,
  "day3Enabled" BOOLEAN NOT NULL DEFAULT true,
  "day3OffsetDays" INTEGER NOT NULL DEFAULT 3,
  "day10Enabled" BOOLEAN NOT NULL DEFAULT true,
  "day10OffsetDays" INTEGER NOT NULL DEFAULT 7,
  "day15Enabled" BOOLEAN NOT NULL DEFAULT true,
  "day15OffsetDays" INTEGER NOT NULL DEFAULT 15,
  "day30Enabled" BOOLEAN NOT NULL DEFAULT true,
  "day30OffsetDays" INTEGER NOT NULL DEFAULT 30,
  "companyId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recovery_automation_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recovery_automation_settings_scope_key" ON "recovery_automation_settings"("scope");
CREATE INDEX "recovery_automation_settings_companyId_idx" ON "recovery_automation_settings"("companyId");

DROP INDEX IF EXISTS "recovery_campaigns_active_client_unique";
ALTER TABLE "recovery_campaigns"
  ADD COLUMN "receivableId" UUID;

UPDATE "recovery_campaigns" rc
SET "receivableId" = (
  SELECT r."id"
  FROM "receivables" r
  WHERE r."clientReferenceId" = rc."clientReferenceId"
    AND r."status" = 'PENDENTE'
  ORDER BY r."dueDate" ASC, r."createdAt" ASC
  LIMIT 1
)
WHERE rc."receivableId" IS NULL;

UPDATE "message_dispatches" md
SET "receivableId" = rc."receivableId"
FROM "recovery_campaigns" rc
WHERE md."recoveryCampaignId" = rc."id"
  AND md."origin" = 'RECOVERY'
  AND md."receivableId" IS NULL
  AND rc."receivableId" IS NOT NULL;

UPDATE "recovery_campaign_steps" rcs
SET "status" = 'CANCELED',
    "canceledAt" = CURRENT_TIMESTAMP
FROM "recovery_campaigns" rc
WHERE rcs."campaignId" = rc."id"
  AND rc."status" = 'ATIVA'
  AND rc."receivableId" IS NULL
  AND rcs."status" IN ('SCHEDULED', 'FAILED');

UPDATE "message_dispatches" md
SET "status" = 'CANCELED',
    "errorCode" = 'LEGACY_RECOVERY_WITHOUT_RECEIVABLE',
    "errorMessage" = 'Campanha legada cancelada porque recuperacao agora exige conta a receber vencida.',
    "nextAttemptAt" = NULL
FROM "recovery_campaigns" rc
WHERE md."recoveryCampaignId" = rc."id"
  AND rc."status" = 'ATIVA'
  AND rc."receivableId" IS NULL
  AND md."origin" = 'RECOVERY'
  AND md."status" IN ('SCHEDULED', 'FAILED');

UPDATE "recovery_campaigns"
SET "status" = 'CANCELADA',
    "canceledAt" = CURRENT_TIMESTAMP,
    "cancelReason" = 'Campanha legada sem conta a receber vinculada cancelada pela nova regra de recuperacao por inadimplencia.'
WHERE "status" = 'ATIVA'
  AND "receivableId" IS NULL;

CREATE INDEX "recovery_campaigns_receivableId_idx" ON "recovery_campaigns"("receivableId");

ALTER TABLE "recovery_campaigns"
  ADD CONSTRAINT "recovery_campaigns_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "recovery_campaigns_active_receivable_unique"
  ON "recovery_campaigns"("receivableId")
  WHERE "status" = 'ATIVA' AND "receivableId" IS NOT NULL;

ALTER TABLE "recovery_campaigns"
  ADD CONSTRAINT "recovery_campaigns_active_requires_receivable"
  CHECK ("status" <> 'ATIVA' OR "receivableId" IS NOT NULL);
