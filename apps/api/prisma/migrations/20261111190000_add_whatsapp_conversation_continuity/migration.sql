CREATE TABLE "whatsapp_conversation_continuities" (
    "id" UUID NOT NULL,
    "predecessorConversationId" UUID NOT NULL,
    "successorConversationId" UUID NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversation_continuities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whatsapp_conversation_continuities_distinct_check"
      CHECK ("predecessorConversationId" <> "successorConversationId")
);

CREATE UNIQUE INDEX "whatsapp_conversation_continuities_predecessorConversationId_key"
ON "whatsapp_conversation_continuities"("predecessorConversationId");

CREATE UNIQUE INDEX "whatsapp_conversation_continuities_successorConversationId_key"
ON "whatsapp_conversation_continuities"("successorConversationId");

CREATE INDEX "whatsapp_conversation_continuities_createdAt_idx"
ON "whatsapp_conversation_continuities"("createdAt");

ALTER TABLE "whatsapp_conversation_continuities"
ADD CONSTRAINT "whatsapp_conversation_continuities_predecessorConversationId_fkey"
FOREIGN KEY ("predecessorConversationId") REFERENCES "whatsapp_conversations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversation_continuities"
ADD CONSTRAINT "whatsapp_conversation_continuities_successorConversationId_fkey"
FOREIGN KEY ("successorConversationId") REFERENCES "whatsapp_conversations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversation_continuities"
ADD CONSTRAINT "whatsapp_conversation_continuities_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
