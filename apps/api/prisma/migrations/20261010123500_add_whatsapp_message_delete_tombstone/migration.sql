ALTER TABLE "whatsapp_messages"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedForEveryone" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "whatsapp_messages_deletedAt_idx"
  ON "whatsapp_messages"("deletedAt");
