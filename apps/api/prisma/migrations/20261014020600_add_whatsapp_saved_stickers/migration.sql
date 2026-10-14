-- CreateTable
CREATE TABLE "whatsapp_saved_stickers" (
    "id" UUID NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "sourceMessageId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_saved_stickers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_saved_stickers_sha256_key" ON "whatsapp_saved_stickers"("sha256");

-- CreateIndex
CREATE INDEX "whatsapp_saved_stickers_createdAt_idx" ON "whatsapp_saved_stickers"("createdAt");
