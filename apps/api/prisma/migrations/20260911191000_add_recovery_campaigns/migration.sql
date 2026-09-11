-- AlterEnum
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_CAMPAIGN_STARTED';
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_CAMPAIGN_CANCELED';
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_CAMPAIGN_COMPLETED';

-- AlterEnum
ALTER TYPE "MessageTemplateType" ADD VALUE IF NOT EXISTS 'RECOVERY_DAY_3';
ALTER TYPE "MessageTemplateType" ADD VALUE IF NOT EXISTS 'RECOVERY_DAY_10';
ALTER TYPE "MessageTemplateType" ADD VALUE IF NOT EXISTS 'RECOVERY_DAY_15';
ALTER TYPE "MessageTemplateType" ADD VALUE IF NOT EXISTS 'RECOVERY_DAY_30';

-- CreateEnum
CREATE TYPE "RecoveryCampaignStatus" AS ENUM ('ATIVA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RecoveryCampaignStepStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELED', 'IGNORED');

-- AlterTable
ALTER TABLE "message_dispatches"
  ADD COLUMN "recoveryCampaignId" UUID;

-- CreateTable
CREATE TABLE "recovery_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId" UUID NOT NULL,
  "status" "RecoveryCampaignStatus" NOT NULL DEFAULT 'ATIVA',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "recovery_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_campaign_steps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaignId" UUID NOT NULL,
  "stepNumber" INTEGER NOT NULL,
  "delayDays" INTEGER NOT NULL,
  "templateId" UUID,
  "dispatchId" UUID,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "RecoveryCampaignStepStatus" NOT NULL DEFAULT 'SCHEDULED',
  "sentAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "recovery_campaign_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovery_campaigns_clientId_idx" ON "recovery_campaigns"("clientId");
CREATE INDEX "recovery_campaigns_status_idx" ON "recovery_campaigns"("status");
CREATE INDEX "recovery_campaigns_startedAt_idx" ON "recovery_campaigns"("startedAt");
CREATE UNIQUE INDEX "recovery_campaigns_active_client_unique" ON "recovery_campaigns"("clientId") WHERE "status" = 'ATIVA';
CREATE UNIQUE INDEX "recovery_campaign_steps_campaignId_stepNumber_key" ON "recovery_campaign_steps"("campaignId", "stepNumber");
CREATE UNIQUE INDEX "recovery_campaign_steps_dispatchId_key" ON "recovery_campaign_steps"("dispatchId");
CREATE INDEX "recovery_campaign_steps_campaignId_idx" ON "recovery_campaign_steps"("campaignId");
CREATE INDEX "recovery_campaign_steps_templateId_idx" ON "recovery_campaign_steps"("templateId");
CREATE INDEX "recovery_campaign_steps_status_idx" ON "recovery_campaign_steps"("status");
CREATE INDEX "recovery_campaign_steps_scheduledFor_idx" ON "recovery_campaign_steps"("scheduledFor");
CREATE INDEX "message_dispatches_recoveryCampaignId_idx" ON "message_dispatches"("recoveryCampaignId");

-- AddForeignKey
ALTER TABLE "recovery_campaigns" ADD CONSTRAINT "recovery_campaigns_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_campaign_steps" ADD CONSTRAINT "recovery_campaign_steps_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "recovery_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_campaign_steps" ADD CONSTRAINT "recovery_campaign_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recovery_campaign_steps" ADD CONSTRAINT "recovery_campaign_steps_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "message_dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_recoveryCampaignId_fkey" FOREIGN KEY ("recoveryCampaignId") REFERENCES "recovery_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
