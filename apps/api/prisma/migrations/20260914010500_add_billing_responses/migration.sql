ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'BILLING_RENEWAL_ACCEPTED';
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'BILLING_RENEWAL_DECLINED';
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'BILLING_RESPONSE_AMBIGUOUS';
ALTER TYPE "ClientEventType" ADD VALUE IF NOT EXISTS 'BILLING_REFERENCE_DEACTIVATED';

CREATE TYPE "BillingResponseDecision" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "billing_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageDispatchId" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "clientReferenceId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "inboundMessageId" UUID,
    "decision" "BillingResponseDecision" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "responseText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_responses_messageDispatchId_key" ON "billing_responses"("messageDispatchId");
CREATE UNIQUE INDEX "billing_responses_inboundMessageId_key" ON "billing_responses"("inboundMessageId");
CREATE INDEX "billing_responses_receivableId_idx" ON "billing_responses"("receivableId");
CREATE INDEX "billing_responses_clientReferenceId_idx" ON "billing_responses"("clientReferenceId");
CREATE INDEX "billing_responses_clientId_idx" ON "billing_responses"("clientId");
CREATE INDEX "billing_responses_decision_idx" ON "billing_responses"("decision");
CREATE INDEX "billing_responses_respondedAt_idx" ON "billing_responses"("respondedAt");
CREATE INDEX "billing_responses_providerMessageId_idx" ON "billing_responses"("providerMessageId");

ALTER TABLE "billing_responses" ADD CONSTRAINT "billing_responses_messageDispatchId_fkey" FOREIGN KEY ("messageDispatchId") REFERENCES "message_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_responses" ADD CONSTRAINT "billing_responses_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_responses" ADD CONSTRAINT "billing_responses_clientReferenceId_fkey" FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_responses" ADD CONSTRAINT "billing_responses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_responses" ADD CONSTRAINT "billing_responses_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "whatsapp_inbound_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
