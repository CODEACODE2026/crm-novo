CREATE TABLE "payment_provider_whatsapp_pix_settings" (
    "provider" "PaymentProviderCode" NOT NULL,
    "environment" "PaymentProviderEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "merchantName" TEXT NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_provider_whatsapp_pix_settings_pkey"
        PRIMARY KEY ("provider", "environment"),
    CONSTRAINT "payment_provider_whatsapp_pix_settings_merchant_name_check"
        CHECK (char_length(btrim("merchantName")) BETWEEN 2 AND 25),
    CONSTRAINT "payment_provider_whatsapp_pix_settings_updated_by_fkey"
        FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);
