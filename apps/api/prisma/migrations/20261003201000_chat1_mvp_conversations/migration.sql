-- CreateEnum
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WhatsAppConversationMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppConversationMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppConversationMessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'LOCATION', 'BUTTON', 'UNKNOWN');

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" UUID NOT NULL,
    "whatsAppConnectionId" UUID NOT NULL,
    "instanceName" TEXT,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'KIRAGO',
    "externalInstanceId" TEXT,
    "clientId" UUID,
    "contactName" TEXT,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "whatsAppConnectionId" UUID NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'KIRAGO',
    "providerMessageId" TEXT,
    "requestId" TEXT,
    "messageDispatchId" UUID,
    "direction" "WhatsAppConversationMessageDirection" NOT NULL,
    "type" "WhatsAppConversationMessageType" NOT NULL,
    "text" TEXT,
    "mediaMimeType" TEXT,
    "mediaFileName" TEXT,
    "mediaSizeBytes" INTEGER,
    "mediaDurationSeconds" INTEGER,
    "status" "WhatsAppConversationMessageStatus" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "isFromMe" BOOLEAN NOT NULL DEFAULT false,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_whatsAppConnectionId_phoneNormalized_key" ON "whatsapp_conversations"("whatsAppConnectionId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_lastMessageAt_idx" ON "whatsapp_conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_clientId_idx" ON "whatsapp_conversations"("clientId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_status_idx" ON "whatsapp_conversations"("status");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_whatsAppConnectionId_status_lastMessageAt_idx" ON "whatsapp_conversations"("whatsAppConnectionId", "status", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_provider_whatsAppConnectionId_providerMessageId_key" ON "whatsapp_messages"("provider", "whatsAppConnectionId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_whatsAppConnectionId_requestId_key" ON "whatsapp_messages"("whatsAppConnectionId", "requestId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_createdAt_idx" ON "whatsapp_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_messageDispatchId_idx" ON "whatsapp_messages"("messageDispatchId");

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_whatsAppConnectionId_fkey" FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_whatsAppConnectionId_fkey" FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_messageDispatchId_fkey" FOREIGN KEY ("messageDispatchId") REFERENCES "message_dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
