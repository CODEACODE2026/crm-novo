-- CreateTable
CREATE TABLE "whatsapp_message_reactions" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "whatsAppConnectionId" UUID NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'KIRAGO',
    "emoji" TEXT NOT NULL,
    "reactorKey" TEXT NOT NULL,
    "isFromMe" BOOLEAN NOT NULL DEFAULT false,
    "providerReactionId" TEXT,
    "participant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_reactions_messageId_reactorKey_key" ON "whatsapp_message_reactions"("messageId", "reactorKey");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_reactions_provider_whatsAppConnectionId_providerReactionId_key" ON "whatsapp_message_reactions"("provider", "whatsAppConnectionId", "providerReactionId");

-- CreateIndex
CREATE INDEX "whatsapp_message_reactions_messageId_idx" ON "whatsapp_message_reactions"("messageId");

-- CreateIndex
CREATE INDEX "whatsapp_message_reactions_whatsAppConnectionId_idx" ON "whatsapp_message_reactions"("whatsAppConnectionId");

-- CreateIndex
CREATE INDEX "whatsapp_message_reactions_providerReactionId_idx" ON "whatsapp_message_reactions"("providerReactionId");

-- AddForeignKey
ALTER TABLE "whatsapp_message_reactions" ADD CONSTRAINT "whatsapp_message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "whatsapp_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_message_reactions" ADD CONSTRAINT "whatsapp_message_reactions_whatsAppConnectionId_fkey" FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
