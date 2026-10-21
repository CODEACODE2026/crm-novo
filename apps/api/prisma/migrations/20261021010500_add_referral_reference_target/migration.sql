-- Keep the data backfill, index replacement and foreign key installation
-- atomic. Prisma Migrate 6 does not wrap PostgreSQL migration.sql files in a
-- transaction automatically.
BEGIN;

-- Add the reference target without assigning ambiguous legacy referrals.
ALTER TABLE "referrals"
  ADD COLUMN "referredClientReferenceId" UUID;

-- A composite target guarantees that the selected reference belongs to the
-- same referred client already stored on the referral.
CREATE UNIQUE INDEX "client_references_id_clientId_key"
  ON "client_references"("id", "clientId");

-- Backfill only from the qualification evidence recorded by the CRM. Rows
-- without this evidence remain legacy referrals with a NULL target.
UPDATE "referrals" AS referral
SET "referredClientReferenceId" = receivable."clientReferenceId"
FROM "receivables" AS receivable
JOIN "client_references" AS reference
  ON reference."id" = receivable."clientReferenceId"
WHERE referral."qualificationReceivableId" = receivable."id"
  AND receivable."purpose" = 'INITIAL_ACTIVATION'
  AND receivable."clientId" = referral."referredClientId"
  AND reference."clientId" = referral."referredClientId"
  AND receivable."clientReferenceId" IS NOT NULL;

-- Replace client-wide uniqueness only after deterministic targets have been
-- populated. Canceled referrals continue occupying their exact target.
DROP INDEX "referrals_referredClientId_key";

CREATE UNIQUE INDEX "referrals_referredClientReferenceId_key"
  ON "referrals"("referredClientReferenceId");

-- Legacy referrals stay limited to one unbound row per client. PostgreSQL
-- partial indexes are used because NULL values are otherwise not unique.
CREATE UNIQUE INDEX "referrals_legacy_referredClientId_key"
  ON "referrals"("referredClientId")
  WHERE "referredClientReferenceId" IS NULL;

DROP INDEX "referrals_qualificationReceivableId_idx";

CREATE UNIQUE INDEX "referrals_qualificationReceivableId_key"
  ON "referrals"("qualificationReceivableId");

CREATE INDEX "referrals_referredClientId_idx"
  ON "referrals"("referredClientId");

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referredClientReferenceId_referredClientId_fkey"
  FOREIGN KEY ("referredClientReferenceId", "referredClientId")
  REFERENCES "client_references"("id", "clientId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
