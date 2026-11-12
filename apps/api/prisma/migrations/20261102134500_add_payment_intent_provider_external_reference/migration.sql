ALTER TABLE "payment_intents"
ADD COLUMN "providerEnvironment" "PaymentProviderEnvironment",
ADD COLUMN "providerExternalReference" TEXT;

CREATE UNIQUE INDEX "payment_intents_mercado_pago_payment_id_key"
ON "payment_intents" ("externalDepixId")
WHERE "provider" = 'MERCADO_PAGO' AND "externalDepixId" IS NOT NULL;

CREATE UNIQUE INDEX "payment_intents_mercado_pago_external_reference_key"
ON "payment_intents" ("providerExternalReference")
WHERE "provider" = 'MERCADO_PAGO' AND "providerExternalReference" IS NOT NULL;
