CREATE TYPE "WhatsAppAttendanceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED');

CREATE TABLE "whatsapp_attendance_categories" (
  "id" UUID NOT NULL,
  "whatsAppConnectionId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "color" "WhatsAppConversationLabelColor" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_attendance_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_attendances" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "whatsAppConnectionId" UUID NOT NULL,
  "clientId" UUID,
  "status" "WhatsAppAttendanceStatus" NOT NULL DEFAULT 'PENDING',
  "openedAt" TIMESTAMP(3) NOT NULL,
  "firstAgentReplyAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "categoryId" UUID,
  "resolutionNote" TEXT,
  "openedByMessageId" UUID NOT NULL,
  "resolvedByUserId" UUID,
  "inboundMessagesCount" INTEGER NOT NULL DEFAULT 1,
  "outboundMessagesCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_attendances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_attendances_resolved_category_check"
    CHECK ("status" <> 'RESOLVED' OR ("categoryId" IS NOT NULL AND "resolvedAt" IS NOT NULL)),
  CONSTRAINT "whatsapp_attendances_nonnegative_counts_check"
    CHECK ("inboundMessagesCount" >= 0 AND "outboundMessagesCount" >= 0)
);

ALTER TABLE "whatsapp_messages" ADD COLUMN "attendanceId" UUID;

CREATE UNIQUE INDEX "whatsapp_attendance_categories_connection_normalized_key"
ON "whatsapp_attendance_categories"("whatsAppConnectionId", "normalizedName");
CREATE INDEX "whatsapp_attendance_categories_connection_active_order_idx"
ON "whatsapp_attendance_categories"("whatsAppConnectionId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "whatsapp_attendances_openedByMessageId_key"
ON "whatsapp_attendances"("openedByMessageId");
CREATE UNIQUE INDEX "whatsapp_attendances_one_active_per_conversation_key"
ON "whatsapp_attendances"("conversationId")
WHERE "status" IN ('PENDING', 'IN_PROGRESS');
CREATE INDEX "whatsapp_attendances_conversation_openedAt_idx"
ON "whatsapp_attendances"("conversationId", "openedAt");
CREATE INDEX "whatsapp_attendances_connection_status_openedAt_idx"
ON "whatsapp_attendances"("whatsAppConnectionId", "status", "openedAt");
CREATE INDEX "whatsapp_attendances_client_openedAt_idx"
ON "whatsapp_attendances"("clientId", "openedAt");
CREATE INDEX "whatsapp_attendances_category_resolvedAt_idx"
ON "whatsapp_attendances"("categoryId", "resolvedAt");
CREATE INDEX "whatsapp_messages_attendanceId_createdAt_idx"
ON "whatsapp_messages"("attendanceId", "createdAt");

ALTER TABLE "whatsapp_attendance_categories"
ADD CONSTRAINT "whatsapp_attendance_categories_connection_fkey"
FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_attendances"
ADD CONSTRAINT "whatsapp_attendances_conversation_fkey"
FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_attendances"
ADD CONSTRAINT "whatsapp_attendances_connection_fkey"
FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_attendances"
ADD CONSTRAINT "whatsapp_attendances_client_fkey"
FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_attendances"
ADD CONSTRAINT "whatsapp_attendances_category_fkey"
FOREIGN KEY ("categoryId") REFERENCES "whatsapp_attendance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_attendances"
ADD CONSTRAINT "whatsapp_attendances_opened_message_fkey"
FOREIGN KEY ("openedByMessageId") REFERENCES "whatsapp_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_attendances"
ADD CONSTRAINT "whatsapp_attendances_resolved_by_fkey"
FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages"
ADD CONSTRAINT "whatsapp_messages_attendance_fkey"
FOREIGN KEY ("attendanceId") REFERENCES "whatsapp_attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
