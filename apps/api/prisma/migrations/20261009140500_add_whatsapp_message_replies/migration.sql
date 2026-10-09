ALTER TABLE "whatsapp_messages"
  ADD COLUMN "replyToMessageId" UUID,
  ADD COLUMN "replyToProviderMessageId" TEXT,
  ADD COLUMN "quotedText" TEXT;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_replyToMessageId_fkey"
  FOREIGN KEY ("replyToMessageId")
  REFERENCES "whatsapp_messages"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "whatsapp_messages_replyToMessageId_idx"
  ON "whatsapp_messages"("replyToMessageId");

CREATE INDEX "whatsapp_messages_reply_provider_msg_idx"
  ON "whatsapp_messages"("provider", "whatsAppConnectionId", "replyToProviderMessageId");
