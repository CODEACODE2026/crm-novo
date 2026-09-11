-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('KIRAGO');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'QR_REQUIRED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageDispatchOrigin" AS ENUM ('MANUAL', 'BILLING', 'RECOVERY');

-- CreateEnum
CREATE TYPE "MessageDispatchStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "ClientEventType" ADD VALUE 'WHATSAPP_MESSAGE_SENT';

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'KIRAGO',
    "providerUserId" TEXT,
    "providerTokenEncrypted" TEXT NOT NULL,
    "phone" TEXT,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "loggedIn" BOOLEAN NOT NULL DEFAULT false,
    "webhookConfigured" BOOLEAN NOT NULL DEFAULT false,
    "lastStatusAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_dispatches" (
    "id" UUID NOT NULL,
    "clientId" UUID,
    "whatsAppConnectionId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "origin" "MessageDispatchOrigin" NOT NULL DEFAULT 'MANUAL',
    "status" "MessageDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "requestId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_connections_provider_idx" ON "whatsapp_connections"("provider");

-- CreateIndex
CREATE INDEX "whatsapp_connections_status_idx" ON "whatsapp_connections"("status");

-- CreateIndex
CREATE INDEX "whatsapp_connections_createdAt_idx" ON "whatsapp_connections"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_dispatches_requestId_key" ON "message_dispatches"("requestId");

-- CreateIndex
CREATE INDEX "message_dispatches_clientId_idx" ON "message_dispatches"("clientId");

-- CreateIndex
CREATE INDEX "message_dispatches_whatsAppConnectionId_idx" ON "message_dispatches"("whatsAppConnectionId");

-- CreateIndex
CREATE INDEX "message_dispatches_status_idx" ON "message_dispatches"("status");

-- CreateIndex
CREATE INDEX "message_dispatches_origin_idx" ON "message_dispatches"("origin");

-- CreateIndex
CREATE INDEX "message_dispatches_createdAt_idx" ON "message_dispatches"("createdAt");

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_whatsAppConnectionId_fkey" FOREIGN KEY ("whatsAppConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

