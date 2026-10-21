BEGIN;

ALTER TABLE "whatsapp_attendance_categories"
ADD COLUMN "systemKey" TEXT;

WITH catalog("systemKey", "normalizedName") AS (
  VALUES
    ('technical_support', 'suporte técnico'),
    ('guidance', 'dúvida / orientação'),
    ('new_product_service', 'novo produto / serviço'),
    ('finance_billing', 'financeiro / cobrança'),
    ('renewal', 'renovação'),
    ('registration_change', 'alteração de cadastro'),
    ('outage_issue', 'problema / indisponibilidade'),
    ('configuration', 'configuração'),
    ('cancellation', 'cancelamento'),
    ('commercial', 'comercial'),
    ('other', 'outro')
)
UPDATE "whatsapp_attendance_categories" AS category
SET "systemKey" = catalog."systemKey"
FROM catalog
WHERE category."normalizedName" = catalog."normalizedName";

CREATE UNIQUE INDEX "whatsapp_attendance_categories_connection_system_key"
ON "whatsapp_attendance_categories"("whatsAppConnectionId", "systemKey");

COMMIT;
