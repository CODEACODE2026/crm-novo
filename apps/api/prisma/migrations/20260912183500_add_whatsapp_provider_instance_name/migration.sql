-- AlterTable
ALTER TABLE "whatsapp_connections" ADD COLUMN "providerInstanceName" TEXT;

-- Backfill existing rows with the local display name as a conservative fallback.
UPDATE "whatsapp_connections"
SET "providerInstanceName" = "name"
WHERE "providerInstanceName" IS NULL;

-- CreateIndex
CREATE INDEX "whatsapp_connections_providerInstanceName_idx" ON "whatsapp_connections"("providerInstanceName");
