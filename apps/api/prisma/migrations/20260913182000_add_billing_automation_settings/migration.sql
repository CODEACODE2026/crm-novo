CREATE TABLE "billing_automation_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" TEXT NOT NULL DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "sendTime" VARCHAR(5) NOT NULL DEFAULT '09:00',
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "companyId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_automation_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_automation_settings_scope_key" ON "billing_automation_settings"("scope");
CREATE INDEX "billing_automation_settings_companyId_idx" ON "billing_automation_settings"("companyId");

INSERT INTO "billing_automation_settings" ("scope", "enabled", "sendTime", "timezone", "updatedAt")
VALUES ('global', false, '09:00', 'America/Sao_Paulo', CURRENT_TIMESTAMP)
ON CONFLICT ("scope") DO NOTHING;
