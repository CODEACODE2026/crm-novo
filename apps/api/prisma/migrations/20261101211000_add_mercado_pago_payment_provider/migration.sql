ALTER TYPE "PaymentProviderCode" ADD VALUE 'MERCADO_PAGO';

CREATE TYPE "PaymentProviderEnvironment" AS ENUM ('TEST', 'PRODUCTION');

ALTER TABLE "payment_provider_credentials"
ADD COLUMN "environment" "PaymentProviderEnvironment" NOT NULL DEFAULT 'PRODUCTION';

CREATE INDEX "payment_provider_credentials_provider_environment_active_idx"
ON "payment_provider_credentials"("provider", "environment", "active");
