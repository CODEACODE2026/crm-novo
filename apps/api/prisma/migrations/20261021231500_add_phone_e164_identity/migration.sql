BEGIN;

ALTER TABLE "clients"
ADD COLUMN "phoneE164" VARCHAR(16);

ALTER TABLE "whatsapp_conversations"
ADD COLUMN "phoneE164" VARCHAR(16);

ALTER TABLE "whatsapp_pending_contacts"
ADD COLUMN "phoneE164" VARCHAR(16);

ALTER TABLE "clients"
ADD CONSTRAINT "clients_phone_e164_format_check"
CHECK ("phoneE164" IS NULL OR "phoneE164" ~ '^\+[1-9][0-9]{1,14}$');

ALTER TABLE "whatsapp_conversations"
ADD CONSTRAINT "whatsapp_conversations_phone_e164_format_check"
CHECK ("phoneE164" IS NULL OR "phoneE164" ~ '^\+[1-9][0-9]{1,14}$');

ALTER TABLE "whatsapp_pending_contacts"
ADD CONSTRAINT "whatsapp_pending_contacts_phone_e164_format_check"
CHECK ("phoneE164" IS NULL OR "phoneE164" ~ '^\+[1-9][0-9]{1,14}$');

CREATE INDEX "clients_phone_e164_idx"
ON "clients"("phoneE164");

CREATE UNIQUE INDEX "whatsapp_conversations_connection_phone_e164_unique"
ON "whatsapp_conversations"("whatsAppConnectionId", "phoneE164")
WHERE "phoneE164" IS NOT NULL;

CREATE UNIQUE INDEX "whatsapp_pending_contacts_connection_phone_e164_unique"
ON "whatsapp_pending_contacts"("whatsAppConnectionId", "phoneE164")
WHERE "phoneE164" IS NOT NULL;

COMMIT;
