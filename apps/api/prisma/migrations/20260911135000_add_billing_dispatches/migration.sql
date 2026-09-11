-- CreateEnum
CREATE TYPE "MessageTemplateType" AS ENUM ('BILLING_DUE');

-- AlterEnum
ALTER TYPE "MessageDispatchStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "MessageDispatchStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "MessageDispatchStatus" ADD VALUE IF NOT EXISTS 'CANCELED';
ALTER TYPE "MessageDispatchStatus" ADD VALUE IF NOT EXISTS 'IGNORED';

-- AlterTable
ALTER TABLE "message_dispatches"
  ADD COLUMN "receivableId" UUID,
  ADD COLUMN "templateId" UUID,
  ADD COLUMN "renderedContent" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "errorCode" TEXT;

ALTER TABLE "message_dispatches" ALTER COLUMN "whatsAppConnectionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "message_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "type" "MessageTemplateType" NOT NULL,
  "content" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_type_name_key" ON "message_templates"("type", "name");
CREATE INDEX "message_templates_type_idx" ON "message_templates"("type");
CREATE INDEX "message_templates_active_idx" ON "message_templates"("active");
CREATE UNIQUE INDEX "message_dispatches_idempotencyKey_key" ON "message_dispatches"("idempotencyKey");
CREATE INDEX "message_dispatches_receivableId_idx" ON "message_dispatches"("receivableId");
CREATE INDEX "message_dispatches_templateId_idx" ON "message_dispatches"("templateId");
CREATE INDEX "message_dispatches_scheduledFor_idx" ON "message_dispatches"("scheduledFor");
CREATE INDEX "message_dispatches_nextAttemptAt_idx" ON "message_dispatches"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message_dispatches" DROP CONSTRAINT "message_dispatches_whatsAppConnectionId_fkey";
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_whatsAppConnectionId_fkey" FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
