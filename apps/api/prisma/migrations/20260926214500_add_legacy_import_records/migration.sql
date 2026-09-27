CREATE TYPE "LegacyImportRecordStatus" AS ENUM ('IMPORTED', 'UPDATED', 'FAILED');

CREATE TABLE "legacy_import_records" (
  "id" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "legacyClientId" TEXT NOT NULL,
  "crmClientId" UUID,
  "crmClientReferenceId" UUID,
  "payloadHash" VARCHAR(64) NOT NULL,
  "status" "LegacyImportRecordStatus" NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "legacy_import_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legacy_import_records_source_legacyClientId_key"
  ON "legacy_import_records"("source", "legacyClientId");

CREATE INDEX "legacy_import_records_crmClientId_idx"
  ON "legacy_import_records"("crmClientId");

CREATE INDEX "legacy_import_records_crmClientReferenceId_idx"
  ON "legacy_import_records"("crmClientReferenceId");

CREATE INDEX "legacy_import_records_status_idx"
  ON "legacy_import_records"("status");

CREATE INDEX "legacy_import_records_createdAt_idx"
  ON "legacy_import_records"("createdAt");
