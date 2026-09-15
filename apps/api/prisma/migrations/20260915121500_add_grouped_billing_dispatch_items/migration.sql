-- AlterEnum
ALTER TYPE "MessageTemplateType" ADD VALUE IF NOT EXISTS 'BILLING_DUE_GROUPED';

-- CreateTable
CREATE TABLE "message_dispatch_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageDispatchId" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "clientReferenceId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "referenceSnapshot" TEXT NOT NULL,
    "statusSnapshot" "ReceivableStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_dispatch_items_pkey" PRIMARY KEY ("id")
);

-- Backfill existing unitary billing dispatches as one item each.
INSERT INTO "message_dispatch_items" (
    "messageDispatchId",
    "receivableId",
    "clientReferenceId",
    "amount",
    "dueDate",
    "referenceSnapshot",
    "statusSnapshot",
    "createdAt",
    "updatedAt"
)
SELECT
    md."id",
    r."id",
    cr."id",
    r."amount",
    r."dueDate",
    cr."reference",
    r."status",
    md."createdAt",
    md."updatedAt"
FROM "message_dispatches" md
JOIN "receivables" r ON r."id" = md."receivableId"
JOIN "client_references" cr ON cr."id" = COALESCE(md."clientReferenceId", r."clientReferenceId")
WHERE md."origin" = 'BILLING'
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "message_dispatch_items_messageDispatchId_receivableId_key" ON "message_dispatch_items"("messageDispatchId", "receivableId");
CREATE INDEX "message_dispatch_items_receivableId_idx" ON "message_dispatch_items"("receivableId");
CREATE INDEX "message_dispatch_items_clientReferenceId_idx" ON "message_dispatch_items"("clientReferenceId");
CREATE INDEX "message_dispatch_items_dueDate_idx" ON "message_dispatch_items"("dueDate");

-- AddForeignKey
ALTER TABLE "message_dispatch_items" ADD CONSTRAINT "message_dispatch_items_messageDispatchId_fkey" FOREIGN KEY ("messageDispatchId") REFERENCES "message_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_dispatch_items" ADD CONSTRAINT "message_dispatch_items_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_dispatch_items" ADD CONSTRAINT "message_dispatch_items_clientReferenceId_fkey" FOREIGN KEY ("clientReferenceId") REFERENCES "client_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
