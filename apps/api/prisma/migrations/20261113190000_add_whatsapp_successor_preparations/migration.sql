CREATE TYPE "WhatsAppConversationPreparationStatus" AS ENUM ('PREPARED', 'ACTIVATED', 'CANCELLED', 'FAILED');

CREATE TABLE "whatsapp_conversation_successor_preparations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "predecessorConversationId" UUID NOT NULL,
    "successorConversationId" UUID,
    "successorConversationSnapshotId" UUID NOT NULL,
    "targetConnectionId" UUID NOT NULL,
    "batchKey" VARCHAR(120) NOT NULL,
    "idempotencyKey" VARCHAR(240) NOT NULL,
    "status" "WhatsAppConversationPreparationStatus" NOT NULL DEFAULT 'PREPARED',
    "createdByUserId" UUID,
    "failureReason" VARCHAR(500),
    "activationTrigger" VARCHAR(40),
    "activatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_conversation_successor_preparations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_conversation_successor_preparations_predecessorConversationId_key" ON "whatsapp_conversation_successor_preparations"("predecessorConversationId");
CREATE UNIQUE INDEX "whatsapp_conversation_successor_preparations_successorConversationId_key" ON "whatsapp_conversation_successor_preparations"("successorConversationId");
CREATE UNIQUE INDEX "whatsapp_conversation_successor_preparations_idempotencyKey_key" ON "whatsapp_conversation_successor_preparations"("idempotencyKey");
CREATE INDEX "whatsapp_conversation_successor_preparations_status_createdAt_idx" ON "whatsapp_conversation_successor_preparations"("status", "createdAt");
CREATE INDEX "whatsapp_conversation_successor_preparations_targetConnectionId_status_idx" ON "whatsapp_conversation_successor_preparations"("targetConnectionId", "status");
CREATE INDEX "whatsapp_conversation_successor_preparations_batchKey_idx" ON "whatsapp_conversation_successor_preparations"("batchKey");

ALTER TABLE "whatsapp_conversation_successor_preparations" ADD CONSTRAINT "whatsapp_conversation_successor_preparations_predecessorConversationId_fkey" FOREIGN KEY ("predecessorConversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversation_successor_preparations" ADD CONSTRAINT "whatsapp_conversation_successor_preparations_successorConversationId_fkey" FOREIGN KEY ("successorConversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversation_successor_preparations" ADD CONSTRAINT "whatsapp_conversation_successor_preparations_targetConnectionId_fkey" FOREIGN KEY ("targetConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversation_successor_preparations" ADD CONSTRAINT "whatsapp_conversation_successor_preparations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversation_successor_preparations" ADD CONSTRAINT "whatsapp_conversation_successor_preparations_state_check" CHECK (
  ("status" = 'PREPARED' AND "successorConversationId" IS NOT NULL AND "activatedAt" IS NULL AND "cancelledAt" IS NULL AND "failedAt" IS NULL)
  OR ("status" = 'ACTIVATED' AND "successorConversationId" IS NOT NULL AND "activatedAt" IS NOT NULL AND "cancelledAt" IS NULL AND "failedAt" IS NULL)
  OR ("status" = 'CANCELLED' AND "activatedAt" IS NULL AND "cancelledAt" IS NOT NULL AND "failedAt" IS NULL)
  OR ("status" = 'FAILED' AND "activatedAt" IS NULL AND "cancelledAt" IS NULL AND "failedAt" IS NOT NULL)
);
