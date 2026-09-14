ALTER TABLE "billing_automation_settings"
ADD COLUMN "sendIntervalSeconds" INTEGER NOT NULL DEFAULT 8;

ALTER TABLE "billing_automation_settings"
ADD CONSTRAINT "billing_automation_settings_sendIntervalSeconds_check"
CHECK ("sendIntervalSeconds" BETWEEN 3 AND 300);
