-- AlterEnum
ALTER TYPE "PaymentProviderCode" ADD VALUE 'FASTFLOW';
ALTER TYPE "PaymentProviderCode" ADD VALUE 'FASTPAY';
ALTER TYPE "PaymentProviderCode" ADD VALUE 'DEPIX';

-- CreateTable
CREATE TABLE "payment_provider_credentials" (
    "id" UUID NOT NULL,
    "provider" "PaymentProviderCode" NOT NULL,
    "name" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "tokenLastFour" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validatedAt" TIMESTAMP(3),
    "lastValidationStatus" TEXT,
    "companyId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_provider_credentials_provider_idx" ON "payment_provider_credentials"("provider");

-- CreateIndex
CREATE INDEX "payment_provider_credentials_active_idx" ON "payment_provider_credentials"("active");

-- CreateIndex
CREATE INDEX "payment_provider_credentials_companyId_idx" ON "payment_provider_credentials"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_credentials_one_active_provider_v1_idx" ON "payment_provider_credentials"("provider") WHERE "active" = true AND "companyId" IS NULL;
