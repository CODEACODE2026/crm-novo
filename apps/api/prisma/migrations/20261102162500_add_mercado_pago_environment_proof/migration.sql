-- MERCADOPAGO-PIX-ENV-PROOF-FIX1
-- Additive binding between a validated provider credential and each PaymentIntent.

ALTER TABLE "payment_provider_credentials"
  ADD COLUMN "environmentProofStatus" TEXT,
  ADD COLUMN "environmentProofEnvironment" "PaymentProviderEnvironment",
  ADD COLUMN "environmentProofAccountIdHash" TEXT,
  ADD COLUMN "environmentProofCredentialFingerprint" TEXT,
  ADD COLUMN "environmentProofVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "environmentProofExpiresAt" TIMESTAMP(3);

ALTER TABLE "payment_intents"
  ADD COLUMN "providerCredentialId" UUID,
  ADD COLUMN "providerCredentialFingerprint" TEXT,
  ADD COLUMN "providerAccountIdHash" TEXT,
  ADD COLUMN "providerApplicationId" TEXT;

CREATE INDEX "payment_intents_providerCredentialId_idx"
  ON "payment_intents"("providerCredentialId");

ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_providerCredentialId_fkey"
  FOREIGN KEY ("providerCredentialId")
  REFERENCES "payment_provider_credentials"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
