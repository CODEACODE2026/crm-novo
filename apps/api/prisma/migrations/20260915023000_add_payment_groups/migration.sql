-- CreateEnum
CREATE TYPE "PaymentGroupStatus" AS ENUM ('CREATED', 'WAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELED', 'FAILED');

-- CreateTable
CREATE TABLE "payment_groups" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "status" "PaymentGroupStatus" NOT NULL DEFAULT 'CREATED',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAt" DATE,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_group_items" (
    "id" UUID NOT NULL,
    "paymentGroupId" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_group_items_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN "paymentGroupId" UUID;
ALTER TABLE "payment_intents" ALTER COLUMN "receivableId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "financial_transactions" ADD COLUMN "paymentGroupId" UUID;

-- CreateIndex
CREATE INDEX "payment_groups_clientId_idx" ON "payment_groups"("clientId");

-- CreateIndex
CREATE INDEX "payment_groups_status_idx" ON "payment_groups"("status");

-- CreateIndex
CREATE INDEX "payment_groups_paidAt_idx" ON "payment_groups"("paidAt");

-- CreateIndex
CREATE INDEX "payment_groups_createdAt_idx" ON "payment_groups"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_group_items_paymentGroupId_receivableId_key" ON "payment_group_items"("paymentGroupId", "receivableId");

-- CreateIndex
CREATE INDEX "payment_group_items_receivableId_idx" ON "payment_group_items"("receivableId");

-- CreateIndex
CREATE INDEX "payment_intents_paymentGroupId_idx" ON "payment_intents"("paymentGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_one_active_per_group_idx" ON "payment_intents"("paymentGroupId") WHERE "status" IN ('CREATED', 'WAITING_PAYMENT');

-- CreateIndex
CREATE INDEX "financial_transactions_paymentGroupId_idx" ON "financial_transactions"("paymentGroupId");

-- AddForeignKey
ALTER TABLE "payment_groups" ADD CONSTRAINT "payment_groups_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_groups" ADD CONSTRAINT "payment_groups_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_group_items" ADD CONSTRAINT "payment_group_items_paymentGroupId_fkey" FOREIGN KEY ("paymentGroupId") REFERENCES "payment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_group_items" ADD CONSTRAINT "payment_group_items_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_paymentGroupId_fkey" FOREIGN KEY ("paymentGroupId") REFERENCES "payment_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_paymentGroupId_fkey" FOREIGN KEY ("paymentGroupId") REFERENCES "payment_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
