UPDATE "clients"
SET "billingAnchorDay" = EXTRACT(DAY FROM "dueDate")::INTEGER
WHERE "billingAnchorDay" IS NULL;

ALTER TABLE "clients" ALTER COLUMN "billingAnchorDay" SET NOT NULL;
ALTER TABLE "clients" ADD CONSTRAINT "clients_billingAnchorDay_check" CHECK ("billingAnchorDay" BETWEEN 1 AND 31);
