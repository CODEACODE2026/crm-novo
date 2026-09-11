-- CreateEnum
CREATE TYPE "WhatsAppPendingContactStatus" AS ENUM ('PENDENTE', 'APROVADO', 'IGNORADO');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "WhatsAppInboundMessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'LIVE_LOCATION', 'CONTACT', 'CONTACTS', 'REACTION', 'BUTTON_RESPONSE', 'LIST_RESPONSE', 'INTERACTIVE_RESPONSE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "whatsapp_pending_contacts" (
    "id" UUID NOT NULL,
    "whatsAppConnectionId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "contactName" TEXT,
    "status" "WhatsAppPendingContactStatus" NOT NULL DEFAULT 'PENDENTE',
    "firstMessageText" TEXT,
    "lastMessageText" TEXT,
    "firstMessageType" "WhatsAppInboundMessageType" NOT NULL,
    "lastMessageType" "WhatsAppInboundMessageType" NOT NULL,
    "firstMessageId" TEXT,
    "lastMessageId" TEXT,
    "firstContactAt" TIMESTAMP(3) NOT NULL,
    "lastContactAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 1,
    "clientId" UUID,
    "approvedAt" TIMESTAMP(3),
    "ignoredAt" TIMESTAMP(3),
    "ignoreReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_pending_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_inbound_messages" (
    "id" UUID NOT NULL,
    "whatsAppConnectionId" UUID NOT NULL,
    "pendingContactId" UUID,
    "clientId" UUID,
    "providerMessageId" TEXT,
    "phoneNormalized" TEXT,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "messageType" "WhatsAppInboundMessageType" NOT NULL,
    "text" TEXT,
    "messageTimestamp" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactName" TEXT,
    "instanceName" TEXT,
    "providerUserId" TEXT,
    "mediaMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_pending_contacts_whatsAppConnectionId_phoneNormalized_key" ON "whatsapp_pending_contacts"("whatsAppConnectionId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "whatsapp_pending_contacts_status_idx" ON "whatsapp_pending_contacts"("status");

-- CreateIndex
CREATE INDEX "whatsapp_pending_contacts_phoneNormalized_idx" ON "whatsapp_pending_contacts"("phoneNormalized");

-- CreateIndex
CREATE INDEX "whatsapp_pending_contacts_lastContactAt_idx" ON "whatsapp_pending_contacts"("lastContactAt");

-- CreateIndex
CREATE INDEX "whatsapp_pending_contacts_whatsAppConnectionId_idx" ON "whatsapp_pending_contacts"("whatsAppConnectionId");

-- CreateIndex
CREATE INDEX "whatsapp_pending_contacts_clientId_idx" ON "whatsapp_pending_contacts"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_inbound_messages_whatsAppConnectionId_providerMessageId_key" ON "whatsapp_inbound_messages"("whatsAppConnectionId", "providerMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_messages_phoneNormalized_idx" ON "whatsapp_inbound_messages"("phoneNormalized");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_messages_messageTimestamp_idx" ON "whatsapp_inbound_messages"("messageTimestamp");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_messages_receivedAt_idx" ON "whatsapp_inbound_messages"("receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_messages_whatsAppConnectionId_idx" ON "whatsapp_inbound_messages"("whatsAppConnectionId");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_messages_pendingContactId_idx" ON "whatsapp_inbound_messages"("pendingContactId");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_messages_clientId_idx" ON "whatsapp_inbound_messages"("clientId");

-- AddForeignKey
ALTER TABLE "whatsapp_pending_contacts" ADD CONSTRAINT "whatsapp_pending_contacts_whatsAppConnectionId_fkey" FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_pending_contacts" ADD CONSTRAINT "whatsapp_pending_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_inbound_messages" ADD CONSTRAINT "whatsapp_inbound_messages_whatsAppConnectionId_fkey" FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_inbound_messages" ADD CONSTRAINT "whatsapp_inbound_messages_pendingContactId_fkey" FOREIGN KEY ("pendingContactId") REFERENCES "whatsapp_pending_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_inbound_messages" ADD CONSTRAINT "whatsapp_inbound_messages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
