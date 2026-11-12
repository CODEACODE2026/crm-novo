-- Replace the legacy provider-only active credential constraint with explicit scopes.
-- Existing rows are preserved; this migration changes indexes only.
DROP INDEX IF EXISTS "payment_provider_credentials_one_active_provider_v1_idx";

CREATE UNIQUE INDEX "payment_provider_credentials_one_active_non_mp_provider_v2_idx"
ON "payment_provider_credentials"("provider")
WHERE "active" = true
  AND "companyId" IS NULL
  AND "provider" <> 'MERCADO_PAGO';

CREATE UNIQUE INDEX "payment_provider_credentials_one_active_mp_environment_v1_idx"
ON "payment_provider_credentials"("provider", "environment")
WHERE "active" = true
  AND "companyId" IS NULL
  AND "provider" = 'MERCADO_PAGO';
