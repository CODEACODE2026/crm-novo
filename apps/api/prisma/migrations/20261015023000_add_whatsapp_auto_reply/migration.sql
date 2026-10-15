CREATE TYPE "WhatsAppAutoReplyMode" AS ENUM ('AWAY', 'SERVICE_UNAVAILABLE', 'CUSTOM');
CREATE TYPE "WhatsAppAutoReplyAudience" AS ENUM ('ALL', 'LINKED_CLIENTS', 'UNLINKED_CONTACTS');
CREATE TYPE "WhatsAppAutoReplyExecutionStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "whatsapp_conversations"
ADD COLUMN "needsManualFollowUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastAutoReplyAt" TIMESTAMP(3);

CREATE TABLE "whatsapp_auto_reply_configs" (
  "id" UUID NOT NULL,
  "whatsAppConnectionId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mode" "WhatsAppAutoReplyMode" NOT NULL DEFAULT 'CUSTOM',
  "message" TEXT NOT NULL,
  "cooldownMinutes" INTEGER NOT NULL DEFAULT 720,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "audience" "WhatsAppAutoReplyAudience" NOT NULL DEFAULT 'ALL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_auto_reply_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_auto_reply_executions" (
  "id" UUID NOT NULL,
  "whatsAppConnectionId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "configId" UUID NOT NULL,
  "triggerMessageId" UUID NOT NULL,
  "messageId" UUID,
  "requestId" UUID NOT NULL,
  "reservationKey" UUID,
  "status" "WhatsAppAutoReplyExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_auto_reply_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_auto_reply_configs_whatsAppConnectionId_key"
ON "whatsapp_auto_reply_configs"("whatsAppConnectionId");
CREATE INDEX "whatsapp_auto_reply_configs_enabled_idx"
ON "whatsapp_auto_reply_configs"("enabled");

CREATE UNIQUE INDEX "whatsapp_auto_reply_executions_triggerMessageId_key"
ON "whatsapp_auto_reply_executions"("triggerMessageId");
CREATE UNIQUE INDEX "whatsapp_auto_reply_executions_messageId_key"
ON "whatsapp_auto_reply_executions"("messageId");
CREATE UNIQUE INDEX "whatsapp_auto_reply_executions_requestId_key"
ON "whatsapp_auto_reply_executions"("requestId");
CREATE UNIQUE INDEX "whatsapp_auto_reply_executions_reservationKey_key"
ON "whatsapp_auto_reply_executions"("reservationKey");
CREATE INDEX "whatsapp_auto_reply_executions_whatsAppConnectionId_sentAt_idx"
ON "whatsapp_auto_reply_executions"("whatsAppConnectionId", "sentAt");
CREATE INDEX "whatsapp_auto_reply_executions_conversationId_status_sentAt_idx"
ON "whatsapp_auto_reply_executions"("conversationId", "status", "sentAt");
CREATE INDEX "whatsapp_auto_reply_executions_configId_status_idx"
ON "whatsapp_auto_reply_executions"("configId", "status");

CREATE INDEX "whatsapp_conversations_whatsAppConnectionId_needsManualFollowUp_lastMessageAt_idx"
ON "whatsapp_conversations"("whatsAppConnectionId", "needsManualFollowUp", "lastMessageAt");

ALTER TABLE "whatsapp_auto_reply_configs"
ADD CONSTRAINT "whatsapp_auto_reply_configs_whatsAppConnectionId_fkey"
FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_auto_reply_executions"
ADD CONSTRAINT "whatsapp_auto_reply_executions_whatsAppConnectionId_fkey"
FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_auto_reply_executions"
ADD CONSTRAINT "whatsapp_auto_reply_executions_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_auto_reply_executions"
ADD CONSTRAINT "whatsapp_auto_reply_executions_configId_fkey"
FOREIGN KEY ("configId") REFERENCES "whatsapp_auto_reply_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_auto_reply_executions"
ADD CONSTRAINT "whatsapp_auto_reply_executions_triggerMessageId_fkey"
FOREIGN KEY ("triggerMessageId") REFERENCES "whatsapp_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_auto_reply_executions"
ADD CONSTRAINT "whatsapp_auto_reply_executions_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
