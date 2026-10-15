CREATE TYPE "WhatsAppConversationLabelColor" AS ENUM (
  'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'RED', 'PURPLE', 'PINK', 'TEAL', 'GRAY'
);

CREATE TABLE "whatsapp_conversation_labels" (
  "id" UUID NOT NULL,
  "whatsAppConnectionId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "color" "WhatsAppConversationLabelColor" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_conversation_labels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_conversation_label_assignments" (
  "conversationId" UUID NOT NULL,
  "labelId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_conversation_label_assignments_pkey" PRIMARY KEY ("conversationId", "labelId")
);

CREATE UNIQUE INDEX "whatsapp_conversation_labels_whatsAppConnectionId_normalizedName_key"
ON "whatsapp_conversation_labels"("whatsAppConnectionId", "normalizedName");
CREATE INDEX "whatsapp_conversation_labels_whatsAppConnectionId_name_idx"
ON "whatsapp_conversation_labels"("whatsAppConnectionId", "name");
CREATE INDEX "whatsapp_conversation_label_assignments_labelId_idx"
ON "whatsapp_conversation_label_assignments"("labelId");

ALTER TABLE "whatsapp_conversation_labels"
ADD CONSTRAINT "whatsapp_conversation_labels_whatsAppConnectionId_fkey"
FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversation_label_assignments"
ADD CONSTRAINT "whatsapp_conversation_label_assignments_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversation_label_assignments"
ADD CONSTRAINT "whatsapp_conversation_label_assignments_labelId_fkey"
FOREIGN KEY ("labelId") REFERENCES "whatsapp_conversation_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
